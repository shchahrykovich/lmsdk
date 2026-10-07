import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import type { Batch } from "../../../../../worker/db/schema";
import { createBatchWorkflowMock, manage, seedSubmittedBatch, setupFixtures, type Fixtures } from "./helpers";
import { FakeBatchAdapter, createBatchService } from "../../../batches/batch-fixtures";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";

type BatchResponse = {
  batch: { id: number; state: string; prompt: { slug: string | null }; counts: Record<string, number> };
  workflowStatus: string | null;
};

describe("Manage API - batches", () => {
  let f: Fixtures;
  let submitted: Batch;

  beforeEach(async () => {
    f = await setupFixtures();
    submitted = await seedSubmittedBatch(1, f.tenant1.project.id, f.tenant1.prompt.id);
  });

  const seedDraft = async () => {
    const projectId = new ProjectId(f.tenant1.project.id, 1, "seed");
    const { service } = createBatchService(new FakeBatchAdapter());
    return (await service.createBatch(new EntityId(f.tenant1.prompt.id, projectId), {})).batch;
  };

  it("lists the project batches with the prompt and filters active ones", async () => {
    await seedDraft();

    const all = await manage("/projects/support/batches", f.keys.read);
    const active = await manage("/projects/support/batches?state=active", f.keys.read);
    const allBody = await all.json<{ batches: BatchResponse["batch"][]; total: number }>();
    const activeBody = await active.json<{ batches: BatchResponse["batch"][]; total: number }>();

    expect(all.status).toBe(200);
    expect(allBody.total).toBe(2);
    expect(allBody.batches[1]).toMatchObject({ id: submitted.id, state: "submitting", prompt: { slug: "classifier" } });
    expect(activeBody.batches.map((batch) => batch.id)).toEqual([submitted.id]);
  });

  it("returns a batch with the status of its run", async () => {
    const res = await manage(`/projects/support/batches/${submitted.id}`, f.keys.read, {
      batchWorkflow: createBatchWorkflowMock("errored"),
    });

    expect(res.status).toBe(200);
    expect(await res.json<BatchResponse>()).toMatchObject({ batch: { id: submitted.id, counts: { total: 1 } }, workflowStatus: "errored" });
  });

  it("returns 404 for a batch id that is not a number or does not exist", async () => {
    expect((await manage("/projects/support/batches/latest", f.keys.read)).status).toBe(404);
    expect((await manage("/projects/support/batches/999999", f.keys.read)).status).toBe(404);
  });

  it("finishes a stuck batch: stops the run and cancels the items without a result", async () => {
    const batchWorkflow = createBatchWorkflowMock("errored");

    const res = await manage(`/projects/support/batches/${submitted.id}/finish`, f.keys.write, { method: "POST", body: {}, batchWorkflow });
    const item = await env.DB.prepare("SELECT status FROM BatchItems").first<{ status: string }>();

    expect(res.status).toBe(200);
    expect((await res.json<BatchResponse>()).batch).toMatchObject({ state: "finished", counts: { cancelled: 1, pending: 0 } });
    expect(batchWorkflow.get).toHaveBeenCalledWith(`batch-1-${submitted.id}`);
    expect(batchWorkflow.terminate).toHaveBeenCalled();
    expect(item?.status).toBe("cancelled");
  });

  it("returns 409 when finishing a draft", async () => {
    const draft = await seedDraft();

    const res = await manage(`/projects/support/batches/${draft.id}/finish`, f.keys.write, { method: "POST", body: {} });

    expect(res.status).toBe(409);
  });

  it("cancels a draft at once", async () => {
    const draft = await seedDraft();

    const res = await manage(`/projects/support/batches/${draft.id}/cancel`, f.keys.write, { method: "POST", body: {} });

    expect((await res.json<BatchResponse>()).batch.state).toBe("cancelled");
  });

  it("asks a running batch to cancel without ending it", async () => {
    const res = await manage(`/projects/support/batches/${submitted.id}/cancel`, f.keys.write, { method: "POST", body: {} });

    expect((await res.json<{ batch: { state: string; cancel_requested: boolean } }>()).batch).toMatchObject({
      state: "submitting",
      cancel_requested: true,
    });
  });
});
