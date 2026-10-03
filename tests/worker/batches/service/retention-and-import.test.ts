import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { EntityId } from "../../../../worker/shared/entity-id";
import { BatchRetentionService } from "../../../../worker/batches/batch-retention.service";
import { BatchFilesRepository } from "../../../../worker/batches/batch-files.repository";
import { IMPORT_WINDOW_BYTES } from "../../../../worker/batches/batch-runner.service";
import { runBatchWorkflow } from "../../../../worker/workflows/batch.workflow";
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
} from "../batch-fixtures";

const DAY = 24 * 60 * 60 * 1000;

describe("Batch retention", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("deletes a finished batch, its items and its files after 30 days, and keeps newer batches", async () => {
    const prompt = await setupBatchPrompt();
    const adapter = new FakeBatchAdapter();
    const start = new Date("2026-10-03T00:00:00Z");
    const { service } = createBatchService(adapter, () => start);
    const old = await service.createBatch(prompt.promptId, {});
    const oldId = new EntityId(old.batch.id, prompt.projectId);
    await service.addItems(oldId, itemsFor(2));
    await service.submit(oldId);
    await runBatchWorkflow(workflowParams(oldId), recordingStep().step, runnerDeps(adapter, { now: () => start }));
    const fresh = await createBatchService(adapter, () => new Date(start.getTime() + 20 * DAY)).service.createBatch(prompt.promptId, {});
    const retention = new BatchRetentionService(drizzle(env.DB), new BatchFilesRepository(env.PRIVATE_FILES));

    const early = await retention.purgeExpired(new Date(start.getTime() + 29 * DAY));
    const purged = await retention.purgeExpired(new Date(start.getTime() + 31 * DAY));
    const remaining = await env.DB.prepare("SELECT id FROM Batches").all<{ id: number }>();
    const items = await env.DB.prepare("SELECT COUNT(*) AS count FROM BatchItems").first<{ count: number }>();
    const files = await env.PRIVATE_FILES.list({ prefix: `batches/1/${old.batch.id}/` });

    expect(early).toBe(0);
    expect(purged).toBe(1);
    expect(remaining.results.map((row) => row.id)).toEqual([fresh.batch.id]);
    expect(items?.count).toBe(0);
    expect(files.objects).toHaveLength(0);
  });

  it("does not delete a batch that is still running", async () => {
    const prompt = await setupBatchPrompt();
    const { service } = createBatchService(new FakeBatchAdapter(), () => new Date("2026-01-01T00:00:00Z"));
    const { batch } = await service.createBatch(prompt.promptId, {});
    const batchId = new EntityId(batch.id, prompt.projectId);
    await service.addItems(batchId, itemsFor(1));
    await service.submit(batchId);

    const purged = await new BatchRetentionService(drizzle(env.DB), new BatchFilesRepository(env.PRIVATE_FILES)).purgeExpired(
      new Date("2027-01-01T00:00:00Z")
    );

    expect(purged).toBe(0);
  });
});

describe("Result import", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("imports a result line that is larger than the import window", async () => {
    const prompt = await setupBatchPrompt();
    const adapter = new FakeBatchAdapter();
    const big = "x".repeat(IMPORT_WINDOW_BYTES + 1000);
    adapter.outcomeFor = ({ text }) => succeededWith(JSON.stringify({ text: text.endsWith("0") ? big : "small" }));
    const { service } = createBatchService(adapter);
    const { batch } = await service.createBatch(prompt.promptId, {});
    const batchId = new EntityId(batch.id, prompt.projectId);
    await service.addItems(batchId, itemsFor(2));
    await service.submit(batchId);

    await runBatchWorkflow(workflowParams(batchId), recordingStep().step, runnerDeps(adapter));
    const { batch: finished, items } = await service.listResults(batchId, 0, 10);

    expect(finished.succeededCount).toBe(2);
    expect((items[0]!.stored!.result as { text: string }).text).toHaveLength(big.length);
  });
});
