import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { EntityId } from "../../../../worker/shared/entity-id";
import { runBatchWorkflow } from "../../../../worker/workflows/batch.workflow";
import { PACED_MAX_ATTEMPTS, type PacedItemMessage } from "../../../../worker/batches/batch-runner.service";
import {
  FakeBatchAdapter,
  createBatchService,
  itemsFor,
  recordingStep,
  resetDatabase,
  runner,
  runnerDeps,
  setupBatchPrompt,
  workflowParams,
  type BatchPrompt,
} from "../batch-fixtures";
import { jsonResponse, routeFetch, when } from "../adapters/fetch-router";

const openRouterAnswer = (content: string) =>
  jsonResponse({
    id: "gen-1",
    model: "anthropic/claude-sonnet-5",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
    usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25, cost: 0.0004 },
  });

const providerConfig = { openRouterKey: "or-test" };

describe("Paced batches for a provider without a batch API", () => {
  let prompt: BatchPrompt;
  let batchId: EntityId<number>;
  const adapter = new FakeBatchAdapter();

  beforeEach(async () => {
    await resetDatabase();
    prompt = await setupBatchPrompt({ provider: "openrouter", model: "anthropic/claude-sonnet-5" });
    const { service } = createBatchService(adapter);
    const { batch } = await service.createBatch(prompt.promptId, { fallback: "paced" });
    batchId = new EntityId(batch.id, prompt.projectId);
    await service.addItems(batchId, itemsFor(2));
    await service.submit(batchId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const message = async (index: number): Promise<PacedItemMessage> => {
    const row = await env.DB.prepare("SELECT id FROM BatchItems WHERE customId = ?").bind(`article-${index}`).first<{ id: number }>();
    return { tenantId: batchId.tenantId, projectId: batchId.projectId, batchId: batchId.id, itemId: row!.id };
  };

  const pacedRunner = () => runner(adapter, { providerConfig, cache: env.CACHE });

  it("runs an item through execute and stores the result at full price", async () => {
    const { calls } = routeFetch([when("POST", /chat\/completions$/, () => openRouterAnswer('{"dose_mg":10}'))]);

    const outcome = await pacedRunner().runPacedItem(await message(0), 1);
    const { items } = await createBatchService(adapter).service.listResults(batchId, 0, 10);

    expect(outcome).toEqual({ done: true });
    expect(JSON.parse(calls[0]!.body).messages).toEqual([
      { role: "system", content: "Extract the protocol as JSON." },
      { role: "user", content: "article text 0" },
    ]);
    expect(items[0]).toMatchObject({ item: { status: "succeeded", costUsd: 0.0004 }, stored: { result: { dose_mg: 10 } } });
  });

  it("asks the queue to retry a rate-limited item, and gives up after the last attempt", async () => {
    routeFetch([when("POST", /chat\/completions$/, () => jsonResponse({ error: { message: "rate limited" } }, 429))]);

    const early = await pacedRunner().runPacedItem(await message(0), 1);
    const last = await pacedRunner().runPacedItem(await message(0), PACED_MAX_ATTEMPTS);
    const row = await env.DB.prepare("SELECT status, error FROM BatchItems WHERE customId = 'article-0'").first<{ status: string; error: string }>();

    expect(early).toEqual({ done: false, retryAfterSeconds: 30 });
    expect(last).toEqual({ done: true });
    expect(row?.status).toBe("errored");
    expect(JSON.parse(row!.error).code).toBe("rate_limited");
  });

  it("does not retry an item that failed for another reason, because it may be billed", async () => {
    routeFetch([when("POST", /chat\/completions$/, () => jsonResponse({ error: { message: "upstream broke" } }, 502))]);

    const outcome = await pacedRunner().runPacedItem(await message(0), 1);
    const row = await env.DB.prepare("SELECT status FROM BatchItems WHERE customId = 'article-0'").first<{ status: string }>();

    expect(outcome).toEqual({ done: true });
    expect(row?.status).toBe("errored");
  });

  it("marks an item cancelled without calling the provider after cancel", async () => {
    const { calls } = routeFetch([when("POST", /chat\/completions$/, () => openRouterAnswer("x"))]);
    await env.DB.prepare("UPDATE Batches SET cancelRequestedAt = unixepoch()").run();

    await pacedRunner().runPacedItem(await message(0), 1);
    const row = await env.DB.prepare("SELECT status FROM BatchItems WHERE customId = 'article-0'").first<{ status: string }>();

    expect(calls).toHaveLength(0);
    expect(row?.status).toBe("cancelled");
  });

  it("enqueues every item, waits until none is pending and finishes with discount none", async () => {
    const sent: PacedItemMessage[] = [];
    const queue = {
      sendBatch: vi.fn(async (messages: { body: PacedItemMessage }[]) => {
        sent.push(...messages.map((entry) => entry.body));
      }),
    } as unknown as Queue<PacedItemMessage>;
    routeFetch([when("POST", /chat\/completions$/, () => openRouterAnswer('{"ok":true}'))]);
    const deps = runnerDeps(adapter, { pacedQueue: queue, providerConfig, cache: env.CACHE });
    const { step } = recordingStep();
    const consumer = pacedRunner();
    step.sleep.mockImplementation(async () => {
      for (const body of sent.splice(0)) await consumer.runPacedItem(body, 1);
    });

    await runBatchWorkflow(workflowParams(batchId), step, deps);
    const { batch } = await createBatchService(adapter).service.getBatch(batchId);

    expect(batch).toMatchObject({ state: "finished", mode: "paced", succeededCount: 2 });
    expect(batch.costUsd).toBeCloseTo(0.0008, 9);
  });
});
