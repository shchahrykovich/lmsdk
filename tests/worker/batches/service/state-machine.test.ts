import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { EntityId } from "../../../../worker/shared/entity-id";
import { ConflictError, ClientInputValidationError } from "../../../../worker/shared/errors";
import {
  FakeBatchAdapter,
  createBatchService,
  itemsFor,
  resetDatabase,
  setupBatchPrompt,
  type BatchPrompt,
} from "../batch-fixtures";

describe("BatchService - state machine", () => {
  let prompt: BatchPrompt;
  let adapter: FakeBatchAdapter;

  beforeEach(async () => {
    await resetDatabase();
    prompt = await setupBatchPrompt();
    adapter = new FakeBatchAdapter();
  });

  const batchIdOf = (id: number) => new EntityId(id, prompt.projectId);

  it("creates a draft that pins the active version", async () => {
    const { service } = createBatchService(adapter);

    const { batch, created } = await service.createBatch(prompt.promptId, {});

    expect(created).toBe(true);
    expect(batch).toMatchObject({ state: "draft", version: 1, provider: "openai", model: "gpt-6-luna", mode: "native" });
  });

  it("returns the same batch for a repeated idempotency key", async () => {
    const { service } = createBatchService(adapter);

    const first = await service.createBatch(prompt.promptId, { idempotencyKey: "plan-2026-10-03" });
    const second = await service.createBatch(prompt.promptId, { idempotencyKey: "plan-2026-10-03" });
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM Batches").first<{ count: number }>();

    expect(second).toEqual({ batch: first.batch, created: false });
    expect(count?.count).toBe(1);
  });

  it("accepts new items, refuses a custom_id already in the batch and never overwrites it", async () => {
    const { service } = createBatchService(adapter);
    const { batch } = await service.createBatch(prompt.promptId, {});

    const first = await service.addItems(batchIdOf(batch.id), [{ custom_id: "pmid-1", variables: { article: "first" } }]);
    const second = await service.addItems(batchIdOf(batch.id), [
      { custom_id: "pmid-1", variables: { article: "changed" } },
      { custom_id: "pmid-2", variables: { article: "second" } },
    ]);
    const parts = await env.PRIVATE_FILES.list({ prefix: `batches/1/${batch.id}/parts/` });
    const texts = await Promise.all(parts.objects.map(async (object) => (await env.PRIVATE_FILES.get(object.key))!.text()));

    expect(first).toMatchObject({ accepted: 1, duplicates: [] });
    expect(second).toMatchObject({ accepted: 1, duplicates: ["pmid-1"] });
    expect(second.batch.totalItems).toBe(2);
    expect(texts.join("")).toContain("first");
    expect(texts.join("")).not.toContain("changed");
  });

  it("refuses a custom_id that is repeated inside one call", async () => {
    const { service } = createBatchService(adapter);
    const { batch } = await service.createBatch(prompt.promptId, {});

    const result = await service.addItems(batchIdOf(batch.id), [{ custom_id: "a" }, { custom_id: "a" }]);

    expect(result).toMatchObject({ accepted: 1, duplicates: ["a"] });
  });

  it("refuses an item whose rendered request is larger than the provider batch limit", async () => {
    const small = new FakeBatchAdapter("openai", { maxItems: 10, maxBytes: 200 });
    const { service } = createBatchService(small);
    const { batch } = await service.createBatch(prompt.promptId, {});

    const result = await service.addItems(batchIdOf(batch.id), [
      { custom_id: "short", variables: { article: "x" } },
      { custom_id: "long", variables: { article: "y".repeat(500) } },
    ]);

    expect(result.accepted).toBe(1);
    expect(result.refused).toEqual([{ custom_id: "long", reason: expect.stringContaining("limit is 200") }]);
  });

  it("refuses items after submit", async () => {
    const { service } = createBatchService(adapter);
    const { batch } = await service.createBatch(prompt.promptId, {});
    await service.addItems(batchIdOf(batch.id), itemsFor(2));
    await service.submit(batchIdOf(batch.id));

    await expect(service.addItems(batchIdOf(batch.id), itemsFor(1, "late"))).rejects.toBeInstanceOf(ConflictError);
  });

  it("starts the workflow once when submit is repeated", async () => {
    const { service, startWorkflow } = createBatchService(adapter);
    const { batch } = await service.createBatch(prompt.promptId, {});
    await service.addItems(batchIdOf(batch.id), itemsFor(2));

    const first = await service.submit(batchIdOf(batch.id));
    const second = await service.submit(batchIdOf(batch.id));

    expect(startWorkflow).toHaveBeenCalledTimes(1);
    expect(startWorkflow).toHaveBeenCalledWith(`batch-1-${batch.id}`, expect.objectContaining({ batchId: batch.id }));
    expect(first).toMatchObject({ state: "submitting", workflowId: `batch-1-${batch.id}` });
    expect(second.state).toBe("submitting");
  });

  it("refuses to submit an empty batch", async () => {
    const { service } = createBatchService(adapter);
    const { batch } = await service.createBatch(prompt.promptId, {});

    await expect(service.submit(batchIdOf(batch.id))).rejects.toBeInstanceOf(ClientInputValidationError);
  });

  it("keeps rendering with the pinned version after a new version is activated", async () => {
    const { service } = createBatchService(adapter);
    const { batch } = await service.createBatch(prompt.promptId, {});
    await new PromptService(drizzle(env.DB)).updatePrompt(
      prompt.promptId,
      { body: JSON.stringify({ messages: [{ role: "user", content: "VERSION TWO {{article}}" }] }) },
      { activate: true }
    );

    await service.addItems(batchIdOf(batch.id), [{ custom_id: "x", variables: { article: "hello" } }]);
    const part = (await env.PRIVATE_FILES.list({ prefix: `batches/1/${batch.id}/parts/` })).objects[0]!;
    const line = await (await env.PRIVATE_FILES.get(part.key))!.text();
    const stored = await service.requireBatch(batchIdOf(batch.id));

    expect(stored.version).toBe(1);
    expect(line).toContain("Extract the protocol as JSON. | hello");
    expect(line).not.toContain("VERSION TWO");
  });

  it("cancels a draft at once and marks its items cancelled", async () => {
    const { service } = createBatchService(adapter);
    const { batch } = await service.createBatch(prompt.promptId, {});
    await service.addItems(batchIdOf(batch.id), itemsFor(3));

    const cancelled = await service.cancel(batchIdOf(batch.id));
    const again = await service.cancel(batchIdOf(batch.id));

    expect(cancelled).toMatchObject({ state: "cancelled", cancelledCount: 3 });
    expect(again.state).toBe("cancelled");
  });
});
