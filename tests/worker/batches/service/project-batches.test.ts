import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { EntityId } from "../../../../worker/shared/entity-id";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import {
  FakeBatchAdapter,
  PROMPT_BODY,
  createBatchService,
  itemsFor,
  resetDatabase,
  setupBatchPrompt,
  type BatchPrompt,
} from "../batch-fixtures";

describe("BatchService - batches of a project", () => {
  let prompt: BatchPrompt;
  let adapter: FakeBatchAdapter;

  beforeEach(async () => {
    await resetDatabase();
    prompt = await setupBatchPrompt();
    adapter = new FakeBatchAdapter();
  });

  const submittedBatch = async (promptId = prompt.promptId) => {
    const { service } = createBatchService(adapter);
    const { batch } = await service.createBatch(promptId, {});
    const batchId = new EntityId(batch.id, prompt.projectId);
    await service.addItems(batchId, itemsFor(1));
    return await service.submit(batchId);
  };

  it("lists the batches of every prompt, newest first, with the prompt name", async () => {
    const second = await new PromptService(drizzle(env.DB)).createPrompt(prompt.projectId, {
      name: "Summarize",
      slug: "summarize",
      provider: "openai",
      model: "gpt-6-luna",
      body: JSON.stringify(PROMPT_BODY),
    });
    const first = await submittedBatch();
    const latest = await submittedBatch(new EntityId(second.id, prompt.projectId));

    const page = await createBatchService(adapter).service.listProjectBatches(prompt.projectId, 1, 20);

    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 20, totalPages: 1 });
    expect(page.batches.map((batch) => [batch.id, batch.promptName, batch.promptSlug])).toEqual([
      [latest.id, "Summarize", "summarize"],
      [first.id, "Extract protocol", "extract-protocol"],
    ]);
  });

  it("filters by state and pages the result", async () => {
    const { service } = createBatchService(adapter);
    await service.createBatch(prompt.promptId, {});
    await submittedBatch();
    await submittedBatch();

    const active = await service.listProjectBatches(prompt.projectId, 2, 1, ["submitting", "running"]);

    expect(active).toMatchObject({ total: 2, totalPages: 2 });
    expect(active.batches).toHaveLength(1);
    expect(active.batches[0]!.state).toBe("submitting");
  });

  it("does not list the batches of another tenant", async () => {
    await submittedBatch();
    const other = await setupBatchPrompt({ tenantId: 2 });

    const page = await createBatchService(adapter).service.listProjectBatches(other.projectId, 1, 20);

    expect(page).toMatchObject({ total: 0, batches: [] });
  });

  it("reports the run status, null before submit and unknown when the lookup fails", async () => {
    const workflowStatus = vi.fn(async () => "errored");
    const { service } = createBatchService(adapter, undefined, { workflowStatus });
    const { batch: draft } = await service.createBatch(prompt.promptId, {});
    const submitted = await submittedBatch();

    expect(await service.workflowStatus(draft)).toBeNull();
    expect(await service.workflowStatus(submitted)).toBe("errored");
    expect(workflowStatus).toHaveBeenCalledWith(`batch-1-${submitted.id}`);
    workflowStatus.mockRejectedValueOnce(new Error("instance.not_found"));
    expect(await service.workflowStatus(submitted)).toBe("unknown");
  });
});
