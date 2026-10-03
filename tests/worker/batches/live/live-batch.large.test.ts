import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { EntityId } from "../../../../worker/shared/entity-id";
import { runBatchWorkflow } from "../../../../worker/workflows/batch.workflow";
import { BatchService } from "../../../../worker/batches/batch.service";
import { BatchFilesRepository } from "../../../../worker/batches/batch-files.repository";
import { createBatchAdapterFactory } from "../../../../worker/batches/adapters/adapter-factory";
import { providerConfigFromEnv } from "../../../../worker/providers/provider-factory";
import { resetDatabase, setupBatchPrompt, workflowParams } from "../batch-fixtures";

const liveEnv = env as unknown as Env & { LIVE_BATCH_TESTS?: string; LIVE_BATCH_TIMEOUT_MINUTES?: string };
const enabled = liveEnv.LIVE_BATCH_TESTS === "1";
const timeoutMinutes = Number(liveEnv.LIVE_BATCH_TIMEOUT_MINUTES || "90");
const MAX_SLEEP_MS = 60_000;

const realtimeStep = (deadline: number) => ({
  do: async (_name: string, configOrCallback: unknown, maybeCallback?: () => Promise<unknown>) => {
    const callback = (typeof configOrCallback === "function" ? configOrCallback : maybeCallback) as () => Promise<unknown>;
    return await callback();
  },
  sleep: async (_name: string, duration: number) => {
    if (Date.now() > deadline) throw new Error(`The live batch did not finish within ${timeoutMinutes} minutes`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(Number(duration), MAX_SLEEP_MS)));
  },
  sleepUntil: async () => undefined,
  waitForEvent: async () => undefined,
});

const cases = [
  { provider: "openai", model: "gpt-5-nano", key: "OPEN_AI_API_KEY" },
  { provider: "anthropic", model: "claude-haiku-4-5", key: "ANTHROPIC_API_KEY" },
  { provider: "google", model: "gemini-2.5-flash-lite", key: "GEMINI_API_KEY" },
] as const;

describe.skipIf(!enabled)("Live provider batches (LIVE_BATCH_TESTS=1)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it.each(cases)("runs 3 items on $provider to finished and reads them back", async ({ provider, model, key }) => {
    expect(liveEnv[key as keyof Env], `${key} must be set in .dev.vars`).toBeTruthy();
    const prompt = await setupBatchPrompt({
      provider,
      model,
      slug: `live-${provider}`,
      body: { messages: [{ role: "user", content: "Reply with the single word: {{word}}" }] },
    });
    const adapters = createBatchAdapterFactory(providerConfigFromEnv(liveEnv));
    const files = new BatchFilesRepository(env.PRIVATE_FILES);
    const service = new BatchService({ db: drizzle(env.DB), files, adapters, startWorkflow: async () => undefined });
    const { batch } = await service.createBatch(prompt.promptId, {});
    const batchId = new EntityId(batch.id, prompt.projectId);
    await service.addItems(batchId, ["alpha", "beta", "gamma"].map((word) => ({ custom_id: word, variables: { word } })));
    await service.submit(batchId);

    await runBatchWorkflow(workflowParams(batchId), realtimeStep(Date.now() + timeoutMinutes * 60_000) as never, {
      db: drizzle(env.DB),
      files,
      adapters,
    });
    const { batch: finished, items } = await service.listResults(batchId, 0, 10);

    expect(finished.state).toBe("finished");
    expect(items.map(({ item }) => item.status)).toEqual(["succeeded", "succeeded", "succeeded"]);
    expect(items.every(({ stored }) => typeof stored?.result === "string")).toBe(true);
    expect(items.every(({ item }) => item.costUsd !== null && item.costUsd > 0)).toBe(true);
  }, (timeoutMinutes + 5) * 60_000);
});
