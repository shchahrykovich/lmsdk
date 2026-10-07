import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker";
import { ConflictError, NotFoundError } from "../../../../worker/shared/errors";

const mockGetSession = vi.fn();
const service = {
  listProjectBatches: vi.fn(),
  getProjectBatch: vi.fn(),
  workflowStatus: vi.fn(),
  listResults: vi.fn(),
  cancel: vi.fn(),
  finish: vi.fn(),
};

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({ api: { getSession: mockGetSession } })),
}));

vi.mock("../../../../worker/batches/batch-service.factory", () => ({
  batchServiceFor: () => service,
}));

const batchRow = {
  id: 7,
  tenantId: 3,
  projectId: 2,
  promptId: 11,
  promptName: "Extract protocol",
  promptSlug: "extract-protocol",
  version: 1,
  provider: "openai",
  model: "gpt-6-luna",
  mode: "native",
  state: "running",
  idempotencyKey: null,
  metadata: "{}",
  totalItems: 3,
  totalBytes: 100,
  succeededCount: 1,
  erroredCount: 0,
  expiredCount: 0,
  cancelledCount: 0,
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
  costUsd: 0.002,
  unpricedCount: 0,
  workflowId: "batch-3-7",
  errorMessage: null,
  cancelRequestedAt: null,
  submittedAt: new Date("2026-10-07T08:00:00Z"),
  finishedAt: null,
  resultsExpireAt: null,
  createdAt: new Date("2026-10-07T07:59:00Z"),
  updatedAt: new Date("2026-10-07T08:00:00Z"),
};

describe("Batches routes - /api/projects/:projectId/batches", () => {
  beforeEach(() => {
    Object.values(service).forEach((mock) => mock.mockReset());
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com", tenantId: 3 },
      session: { id: "session-1", userId: "user-1", expiresAt: new Date(Date.now() + 1000000) },
    });
    service.getProjectBatch.mockResolvedValue({ batch: batchRow, shards: [] });
    service.workflowStatus.mockResolvedValue("errored");
  });

  const request = (path: string, method = "GET") =>
    app.request(`/api/projects/2/batches${path}`, { method }, { DB: {} as never, PRIVATE_FILES: {} as never });

  it("lists the project batches for the caller's tenant with the active filter", async () => {
    service.listProjectBatches.mockResolvedValue({ batches: [batchRow], total: 1, page: 1, pageSize: 20, totalPages: 1 });

    const response = await request("?state=active");
    const body = await response.json<{ batches: { id: number; prompt: unknown; counts: { pending: number } }[]; total: number }>();

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.batches[0]).toMatchObject({ id: 7, prompt: { id: 11, name: "Extract protocol", slug: "extract-protocol" }, counts: { pending: 2 } });
    expect(service.listProjectBatches).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, tenantId: 3 }),
      1,
      20,
      ["submitting", "running"]
    );
  });

  it("returns 400 for an unknown state filter", async () => {
    const response = await request("?state=paused");

    expect(response.status).toBe(400);
    expect(service.listProjectBatches).not.toHaveBeenCalled();
  });

  it("returns the batch with the status of its run", async () => {
    const response = await request("/7");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ batch: { id: 7, state: "running" }, workflowStatus: "errored" });
    expect(service.getProjectBatch).toHaveBeenCalledWith(expect.objectContaining({ id: 7, projectId: 2, tenantId: 3 }));
  });

  it("returns 404 when the batch is not in the caller's tenant", async () => {
    service.getProjectBatch.mockRejectedValue(new NotFoundError("Batch not found"));

    const response = await request("/7");

    expect(response.status).toBe(404);
  });

  it("finishes a batch and returns it", async () => {
    const response = await request("/7/finish", "POST");

    expect(response.status).toBe(200);
    expect(service.finish).toHaveBeenCalledWith(expect.objectContaining({ id: 7, tenantId: 3 }));
  });

  it("returns 409 when finishing a draft", async () => {
    service.finish.mockRejectedValue(new ConflictError("The batch is a draft"));

    const response = await request("/7/finish", "POST");

    expect(response.status).toBe(409);
  });

  it("cancels a batch and returns it", async () => {
    const response = await request("/7/cancel", "POST");

    expect(response.status).toBe(200);
    expect(service.cancel).toHaveBeenCalledWith(expect.objectContaining({ id: 7, tenantId: 3 }));
  });

  it("pages the items with a cursor and a status filter", async () => {
    const item = { id: 41, customId: "a", status: "errored", usage: null, costUsd: null, error: '{"code":"x","message":"y"}' };
    service.listResults.mockResolvedValue({ batch: batchRow, items: [{ item, stored: null }] });

    const response = await request("/7/items?cursor=40&limit=1&status=errored");

    expect(await response.json()).toEqual({
      items: [expect.objectContaining({ id: 41, custom_id: "a", status: "errored", error: { code: "x", message: "y" } })],
      nextCursor: "41",
    });
    expect(service.listResults).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 40, 1, "errored");
  });

  it("returns 401 without a session", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await request("");

    expect(response.status).toBe(401);
  });
});
