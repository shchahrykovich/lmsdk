import { describe, it, expect, beforeEach } from "vitest";
import { EntityId } from "../../../../worker/shared/entity-id";
import { runBatchWorkflow } from "../../../../worker/workflows/batch.workflow";
import {
  FakeBatchAdapter,
  createBatchService,
  itemsFor,
  recordingStep,
  resetDatabase,
  runnerDeps,
  setupBatchPrompt,
  workflowParams,
  type BatchPrompt,
} from "../batch-fixtures";

describe("Batch workflow poll delays", () => {
  let prompt: BatchPrompt;

  beforeEach(async () => {
    await resetDatabase();
    prompt = await setupBatchPrompt();
  });

  it("polls a long provider batch at most every 5 minutes", async () => {
    const fake = new FakeBatchAdapter();
    fake.pollsUntilDone = 8;
    const { service } = createBatchService(fake);
    const { batch } = await service.createBatch(prompt.promptId, {});
    const batchId = new EntityId(batch.id, prompt.projectId);
    await service.addItems(batchId, itemsFor(2, "call0"));
    await service.submit(batchId);
    const { step } = recordingStep();

    await runBatchWorkflow(workflowParams(batchId), step, runnerDeps(fake));

    const sleeps = (step as unknown as { sleep: { mock: { calls: [string, number][] } } }).sleep.mock.calls;
    expect(sleeps.map(([, ms]) => ms / 1000)).toEqual([30, 60, 120, 300, 300, 300, 300]);
  });
});
