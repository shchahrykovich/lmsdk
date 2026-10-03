import { describe, it, expect, beforeEach } from "vitest";
import { EntityId } from "../../../../worker/shared/entity-id";
import { runBatchWorkflow } from "../../../../worker/workflows/batch.workflow";
import { ProviderRejectedError, RetryLaterError } from "../../../../worker/batches/adapters/batch-adapter";
import {
  FakeBatchAdapter,
  createBatchService,
  itemsFor,
  recordingStep,
  resetDatabase,
  runnerDeps,
  setupBatchPrompt,
  succeededWith,
  workflowParams,
  type BatchPrompt,
} from "../batch-fixtures";

describe("Batch workflow with a provider batch API", () => {
  let prompt: BatchPrompt;

  beforeEach(async () => {
    await resetDatabase();
    prompt = await setupBatchPrompt();
  });

  async function submittedBatch(adapter: FakeBatchAdapter, calls: number[]) {
    const { service } = createBatchService(adapter);
    const { batch } = await service.createBatch(prompt.promptId, {});
    const batchId = new EntityId(batch.id, prompt.projectId);
    for (const [index, count] of calls.entries()) {
      await service.addItems(batchId, itemsFor(count, `call${index}`));
    }
    await service.submit(batchId);
    return { service, batchId };
  }

  it("runs every item and returns results with version, usage and cost", async () => {
    const adapter = new FakeBatchAdapter();
    adapter.pollsUntilDone = 2;
    const { service, batchId } = await submittedBatch(adapter, [3]);

    await runBatchWorkflow(workflowParams(batchId), recordingStep().step, runnerDeps(adapter));
    const { batch, items } = await service.listResults(batchId, 0, 10);

    expect(batch).toMatchObject({ state: "finished", succeededCount: 3, totalTokens: 45 });
    expect(batch.costUsd).toBeCloseTo(0.003, 9);
    expect(items.map(({ item }) => item.customId)).toEqual(["call0-0", "call0-1", "call0-2"]);
    expect(items[0]!.stored).toEqual({
      result: { echo: "Extract the protocol as JSON. | call0 text 0" },
      model: "gpt-6-luna-2026-09-01",
    });
    expect(JSON.parse(items[0]!.item.usage!)).toMatchObject({ prompt_tokens: 10, cost: 0.001 });
  });

  it("splits into several provider batches at the count limit", async () => {
    const adapter = new FakeBatchAdapter("openai", { maxItems: 2, maxBytes: 10_000_000 });
    const { batchId } = await submittedBatch(adapter, [3, 2]);

    await runBatchWorkflow(workflowParams(batchId), recordingStep().step, runnerDeps(adapter));

    expect(adapter.submitted.map((shard) => shard.lines.length)).toEqual([2, 2, 1]);
  });

  it("splits into several provider batches at the byte limit, also inside one part", async () => {
    const lineBytes = new TextEncoder().encode(
      adapter().encodeLine("000000000000000000000000-0", {
        model: "m",
        messages: [
          { role: "system", content: "Extract the protocol as JSON." },
          { role: "user", content: "call0 text 0" },
        ],
      }) + "\n"
    ).byteLength;
    const fake = new FakeBatchAdapter("openai", { maxItems: 100, maxBytes: lineBytes * 2 + 1 });
    const { batchId } = await submittedBatch(fake, [5]);

    await runBatchWorkflow(workflowParams(batchId), recordingStep().step, runnerDeps(fake));

    expect(fake.submitted.map((shard) => shard.lines.length)).toEqual([2, 2, 1]);
    expect(fake.submitted.flatMap((shard) => shard.lines.map((line) => JSON.parse(line).text))).toEqual([
      "Extract the protocol as JSON. | call0 text 0",
      "Extract the protocol as JSON. | call0 text 1",
      "Extract the protocol as JSON. | call0 text 2",
      "Extract the protocol as JSON. | call0 text 3",
      "Extract the protocol as JSON. | call0 text 4",
    ]);
  });

  it("keeps item errors as results and does not fail the batch", async () => {
    const fake = new FakeBatchAdapter();
    fake.outcomeFor = ({ text }) =>
      text.endsWith("1")
        ? { kind: "errored", error: { code: "invalid_request", message: "bad input" } }
        : succeededWith('{"ok":true}');
    const { service, batchId } = await submittedBatch(fake, [3]);

    await runBatchWorkflow(workflowParams(batchId), recordingStep().step, runnerDeps(fake));
    const { batch, items } = await service.listResults(batchId, 0, 10);

    expect(batch).toMatchObject({ state: "finished", succeededCount: 2, erroredCount: 1 });
    expect(JSON.parse(items[1]!.item.error!)).toEqual({ code: "invalid_request", message: "bad input" });
  });

  it("marks items without a result expired when the provider batch expires, and still finishes", async () => {
    const fake = new FakeBatchAdapter();
    fake.shardOutcome = "expired";
    fake.outcomeFor = ({ text }) => (text.endsWith("0") ? succeededWith('{"ok":true}') : null);
    const { service, batchId } = await submittedBatch(fake, [3]);

    await runBatchWorkflow(workflowParams(batchId), recordingStep().step, runnerDeps(fake));
    const { batch } = await service.getBatch(batchId);

    expect(batch).toMatchObject({ state: "finished", succeededCount: 1, expiredCount: 2 });
  });

  it("marks the items errored when the provider batch fails", async () => {
    const fake = new FakeBatchAdapter();
    fake.shardOutcome = "failed";
    fake.outcomeFor = () => null;
    const { service, batchId } = await submittedBatch(fake, [2]);

    await runBatchWorkflow(workflowParams(batchId), recordingStep().step, runnerDeps(fake));
    const { batch } = await service.getBatch(batchId);

    expect(batch).toMatchObject({ state: "finished", erroredCount: 2 });
  });

  it("marks the items errored when the provider rejects the submission", async () => {
    const fake = new FakeBatchAdapter();
    fake.submitError = new ProviderRejectedError("OpenAI: invalid model");
    const { service, batchId } = await submittedBatch(fake, [2]);

    await runBatchWorkflow(workflowParams(batchId), recordingStep().step, runnerDeps(fake));
    const { batch, shards } = await service.getBatch(batchId);

    expect(batch).toMatchObject({ state: "finished", erroredCount: 2 });
    expect(shards[0]).toMatchObject({ state: "failed", errorMessage: "OpenAI: invalid model" });
  });

  it("waits and submits again when the provider asks to retry later", async () => {
    const fake = new FakeBatchAdapter();
    let calls = 0;
    const realSubmit = fake.submit.bind(fake);
    fake.submit = async (shard) => {
      calls++;
      if (calls === 1) throw new RetryLaterError("queue is full");
      return await realSubmit(shard);
    };
    const { service, batchId } = await submittedBatch(fake, [2]);
    const { step, names } = recordingStep();

    await runBatchWorkflow(workflowParams(batchId), step, runnerDeps(fake));
    const { batch } = await service.getBatch(batchId);

    expect(names).toContain("submit-0-0");
    expect(names).toContain("submit-0-1");
    expect(batch).toMatchObject({ state: "finished", succeededCount: 2 });
  });

  it("cancels the running provider batches when the workflow fails, so they are not billed for nothing", async () => {
    const fake = new FakeBatchAdapter();
    fake.pollsUntilDone = 99;
    const { service, batchId } = await submittedBatch(fake, [2]);
    const deps = runnerDeps(fake);
    const { step } = recordingStep();
    const realDo = step.do.getMockImplementation()!;
    step.do.mockImplementation(async (name: string, configOrCallback: unknown, maybeCallback?: () => Promise<unknown>) => {
      if (name.startsWith("ended-")) throw new Error("D1 is down");
      return await realDo(name, configOrCallback, maybeCallback);
    });

    await expect(runBatchWorkflow(workflowParams(batchId), step, deps)).rejects.toThrow("D1 is down");
    const { batch } = await service.getBatch(batchId);

    expect(fake.cancelled).toEqual(["fake_1"]);
    expect(batch).toMatchObject({ state: "failed", erroredCount: 2, errorMessage: "D1 is down" });
  });

  it("cancels the provider batch, keeps finished results and ends cancelled", async () => {
    const fake = new FakeBatchAdapter();
    fake.pollsUntilDone = 2;
    fake.outcomeFor = ({ text }) => (text.endsWith("0") ? succeededWith('{"ok":true}') : { kind: "cancelled" });
    const { service, batchId } = await submittedBatch(fake, [3]);
    const { step } = recordingStep();
    const original = fake.poll.bind(fake);
    let polled = false;
    fake.poll = async (id) => {
      if (!polled) {
        polled = true;
        await service.cancel(batchId, () => fake);
      }
      return await original(id);
    };

    await runBatchWorkflow(workflowParams(batchId), step, runnerDeps(fake));
    const { batch } = await service.getBatch(batchId);

    expect(fake.cancelled).toEqual(["fake_1"]);
    expect(batch).toMatchObject({ state: "cancelled", succeededCount: 1, cancelledCount: 2 });
  });
});

const adapter = () => new FakeBatchAdapter();
