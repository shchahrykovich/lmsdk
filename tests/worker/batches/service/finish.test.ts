import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { EntityId } from "../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../worker/shared/project-id";
import { ConflictError, NotFoundError } from "../../../../worker/shared/errors";
import { BatchItemRepository } from "../../../../worker/batches/batch-item.repository";
import {
  FakeBatchAdapter,
  createBatchService,
  itemsFor,
  resetDatabase,
  runner,
  setupBatchPrompt,
  type BatchPrompt,
} from "../batch-fixtures";

type ItemRow = { customId: string; status: string; error: string | null };

describe("BatchService - finish a batch by hand", () => {
  let prompt: BatchPrompt;
  let adapter: FakeBatchAdapter;
  let stopWorkflow: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await resetDatabase();
    prompt = await setupBatchPrompt();
    adapter = new FakeBatchAdapter("openai", { maxItems: 2, maxBytes: 1024 * 1024 });
    stopWorkflow = vi.fn(async () => undefined);
  });

  const serviceFor = () => createBatchService(adapter, undefined, { stopWorkflow }).service;

  const runningBatchWithOneResult = async () => {
    const service = serviceFor();
    const { batch } = await service.createBatch(prompt.promptId, {});
    const batchId = new EntityId(batch.id, prompt.projectId);
    await service.addItems(batchId, itemsFor(3));
    await service.submit(batchId);
    const batchRunner = runner(adapter);
    await batchRunner.plan(batchId);
    const [firstShard] = (await batchRunner.snapshot(batchId)).shards;
    await batchRunner.submitShard(batchId, firstShard!.id);
    await batchRunner.markRunning(batchId);
    const first = await env.DB.prepare("SELECT id FROM BatchItems WHERE customId = 'article-0'").first<{ id: number }>();
    await new BatchItemRepository(drizzle(env.DB)).complete(batchId, [{ id: first!.id, status: "succeeded", costUsd: 0.002 }], new Date());
    return batchId;
  };

  const itemRows = async () =>
    (await env.DB.prepare("SELECT customId, status, error FROM BatchItems ORDER BY id").all<ItemRow>()).results;

  it("stops the run, cancels the open provider batch, keeps the result and cancels the other items", async () => {
    const batchId = await runningBatchWithOneResult();

    const batch = await serviceFor().finish(batchId);
    const shards = await env.DB.prepare("SELECT state FROM BatchShards ORDER BY seq").all<{ state: string }>();

    expect(stopWorkflow).toHaveBeenCalledWith(`batch-1-${batchId.id}`);
    expect(adapter.cancelled).toEqual(["fake_1"]);
    expect(batch).toMatchObject({ state: "finished", succeededCount: 1, cancelledCount: 2, costUsd: 0.002 });
    expect(batch.finishedAt).not.toBeNull();
    expect(shards.results.map((shard) => shard.state)).toEqual(["cancelled", "cancelled"]);
    expect((await itemRows()).map((row) => [row.customId, row.status])).toEqual([
      ["article-0", "succeeded"],
      ["article-1", "cancelled"],
      ["article-2", "cancelled"],
    ]);
    expect(JSON.parse((await itemRows())[1]!.error!)).toMatchObject({ code: "finished_by_hand" });
  });

  it("ends as cancelled when a cancel was requested before", async () => {
    const batchId = await runningBatchWithOneResult();
    await serviceFor().cancel(batchId);

    const batch = await serviceFor().finish(batchId);

    expect(batch.state).toBe("cancelled");
  });

  it("finishes even when the run cannot be stopped and the provider refuses the cancel", async () => {
    const batchId = await runningBatchWithOneResult();
    stopWorkflow.mockRejectedValueOnce(new Error("instance.not_found"));
    adapter.cancel = vi.fn(async () => {
      throw new Error("provider is down");
    });

    const batch = await serviceFor().finish(batchId);

    expect(batch).toMatchObject({ state: "finished", cancelledCount: 2 });
  });

  it("keeps the finished state when a run that was not stopped wakes up later", async () => {
    const batchId = await runningBatchWithOneResult();
    await serviceFor().finish(batchId);

    await runner(adapter).finish(batchId);
    await runner(adapter).fail(batchId, "late failure");
    const row = await env.DB.prepare("SELECT state, errorMessage, succeededCount FROM Batches").first();

    expect(row).toEqual({ state: "finished", errorMessage: null, succeededCount: 1 });
  });

  it("refuses a draft with a conflict and leaves it a draft", async () => {
    const service = serviceFor();
    const { batch } = await service.createBatch(prompt.promptId, {});

    await expect(service.finish(new EntityId(batch.id, prompt.projectId))).rejects.toBeInstanceOf(ConflictError);
    expect((await env.DB.prepare("SELECT state FROM Batches").first<{ state: string }>())?.state).toBe("draft");
  });

  it("returns a batch that already ended unchanged and does not stop the run again", async () => {
    const batchId = await runningBatchWithOneResult();
    await serviceFor().finish(batchId);
    stopWorkflow.mockClear();

    const batch = await serviceFor().finish(batchId);

    expect(batch.state).toBe("finished");
    expect(stopWorkflow).not.toHaveBeenCalled();
  });

  it("does not find a batch of another tenant", async () => {
    const batchId = await runningBatchWithOneResult();
    const otherTenant = new EntityId(batchId.id, new ProjectId(batchId.projectId, 2, "user-2"));

    await expect(serviceFor().finish(otherTenant)).rejects.toBeInstanceOf(NotFoundError);
    expect((await env.DB.prepare("SELECT state FROM Batches").first<{ state: string }>())?.state).toBe("running");
  });
});
