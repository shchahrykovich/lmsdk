import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { EntityId } from "../../../../worker/shared/entity-id";
import { NotFoundError, UnprocessableEntityError } from "../../../../worker/shared/errors";
import { BatchService } from "../../../../worker/batches/batch.service";
import { BatchFilesRepository } from "../../../../worker/batches/batch-files.repository";
import {
  BatchProviderNotConfiguredError,
  createBatchAdapterFactory,
} from "../../../../worker/batches/adapters/adapter-factory";
import { FakeBatchAdapter, createBatchService, itemsFor, resetDatabase, setupBatchPrompt } from "../batch-fixtures";

describe("BatchService - provider modes", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("refuses an OpenRouter batch with 422 that names the provider when no fallback is given", async () => {
    const prompt = await setupBatchPrompt({ provider: "openrouter", model: "anthropic/claude-sonnet-5" });
    const { service } = createBatchService(new FakeBatchAdapter());

    const attempt = service.createBatch(prompt.promptId, {});

    await expect(attempt).rejects.toBeInstanceOf(UnprocessableEntityError);
    await expect(attempt).rejects.toThrow('Provider "openrouter" has no native batch API');
  });

  it("creates a paced batch for OpenRouter when fallback is paced", async () => {
    const prompt = await setupBatchPrompt({ provider: "openrouter", model: "anthropic/claude-sonnet-5" });
    const { service } = createBatchService(new FakeBatchAdapter());

    const { batch } = await service.createBatch(prompt.promptId, { fallback: "paced" });

    expect(batch).toMatchObject({ mode: "paced", provider: "openrouter" });
  });

  it("stores only the variables for a paced item, because execute renders it later", async () => {
    const prompt = await setupBatchPrompt({ provider: "openrouter", model: "anthropic/claude-sonnet-5" });
    const { service } = createBatchService(new FakeBatchAdapter());
    const { batch } = await service.createBatch(prompt.promptId, { fallback: "paced" });

    await service.addItems(new EntityId(batch.id, prompt.projectId), [{ custom_id: "a", variables: { article: "x" } }]);
    const part = (await env.PRIVATE_FILES.list({ prefix: `batches/1/${batch.id}/parts/` })).objects[0]!;

    expect(JSON.parse((await (await env.PRIVATE_FILES.get(part.key))!.text()).trim())).toEqual({
      key: expect.stringMatching(/^[0-9a-f]{24}-0$/),
      variables: { article: "x" },
    });
  });

  it("refuses an Anthropic batch when the Anthropic key is not configured", async () => {
    const prompt = await setupBatchPrompt({ provider: "anthropic", model: "claude-opus-5-5" });
    const service = new BatchService({
      db: drizzle(env.DB),
      files: new BatchFilesRepository(env.PRIVATE_FILES),
      adapters: createBatchAdapterFactory({ openAIKey: "sk-test" }),
      startWorkflow: async () => undefined,
    });

    await expect(service.createBatch(prompt.promptId, {})).rejects.toBeInstanceOf(BatchProviderNotConfiguredError);
  });
});

describe("BatchService - cross-tenant protection", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("does not let another tenant read, fill, submit, cancel or list a batch", async () => {
    const owner = await setupBatchPrompt({ tenantId: 1 });
    const other = await setupBatchPrompt({ tenantId: 2 });
    const { service } = createBatchService(new FakeBatchAdapter());
    const { batch } = await service.createBatch(owner.promptId, {});
    const foreignId = new EntityId(batch.id, other.projectId);

    await expect(service.getBatch(foreignId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.addItems(foreignId, itemsFor(1))).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.submit(foreignId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.cancel(foreignId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.listResults(foreignId, 0, 10)).rejects.toBeInstanceOf(NotFoundError);
    expect(await service.listBatches(other.promptId, 10)).toEqual([]);
  });

  it("returns the idempotent batch only inside the same prompt and tenant", async () => {
    const owner = await setupBatchPrompt({ tenantId: 1 });
    const other = await setupBatchPrompt({ tenantId: 2 });
    const { service } = createBatchService(new FakeBatchAdapter());

    const first = await service.createBatch(owner.promptId, { idempotencyKey: "same" });
    const second = await service.createBatch(other.promptId, { idempotencyKey: "same" });

    expect(second.created).toBe(true);
    expect(second.batch.id).not.toBe(first.batch.id);
  });
});
