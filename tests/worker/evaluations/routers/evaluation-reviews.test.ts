import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker";

const mockGetSession = vi.fn();
const updateSummaryMock = vi.fn();
const saveComparisonMock = vi.fn();
const createAndStartMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({ api: { getSession: mockGetSession } })),
}));

vi.mock("../../../../worker/evaluations/evaluation.service", () => ({
  EvaluationService: class {
    updateSummary = updateSummaryMock;
    saveComparison = saveComparisonMock;
    createAndStartEvaluation = createAndStartMock;
  },
}));

const env = { DB: {} as any, PRIVATE_FILES: {} as any, EVALUATION_WORKFLOW: {} as any };

const send = (path: string, method: string, body: unknown) =>
  app.request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, env);

describe("Evaluations Routes - summary, manual reviews and base evaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: "user-123", name: "Test", email: "t@example.com", tenantId: 1, emailVerified: true },
      session: { id: "session-123" },
    });
  });

  it("PATCH saves the summary for the evaluation of the caller's tenant", async () => {
    updateSummaryMock.mockResolvedValue({ id: 3, summary: "v2 wins" });

    const response = await send("/api/projects/1/evaluations/3", "PATCH", { summary: "v2 wins" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ evaluation: { id: 3, summary: "v2 wins" } });
    expect(updateSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ id: 3, projectId: 1, tenantId: 1 }), "v2 wins");
  });

  it("PATCH returns 400 when the summary is not a string", async () => {
    const response = await send("/api/projects/1/evaluations/3", "PATCH", { summary: 42 });

    expect(response.status).toBe(400);
    expect(updateSummaryMock).not.toHaveBeenCalled();
  });

  it("PUT saves a manual review of one record and one pair", async () => {
    saveComparisonMock.mockResolvedValue({ recordId: 5, leftVersionId: 100, rightVersionId: 101, description: "ok", score: -1 });

    const response = await send("/api/projects/1/evaluations/3/comparisons", "PUT", {
      recordId: 5,
      leftVersionId: 100,
      rightVersionId: 101,
      description: "ok",
      score: -1,
    });

    expect(response.status).toBe(200);
    expect(saveComparisonMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, tenantId: 1 }),
      { recordId: 5, leftVersionId: 100, rightVersionId: 101 },
      { description: "ok", score: -1 }
    );
  });

  it("PUT returns 400 without a record id", async () => {
    const response = await send("/api/projects/1/evaluations/3/comparisons", "PUT", {
      leftVersionId: 100,
      rightVersionId: 101,
      score: 1,
    });

    expect(response.status).toBe(400);
    expect(saveComparisonMock).not.toHaveBeenCalled();
  });

  it("POST passes the base evaluation id to the service", async () => {
    createAndStartMock.mockResolvedValue({ id: 11 });

    const response = await send("/api/projects/1/evaluations", "POST", {
      name: "v1 vs v2",
      datasetId: 5,
      prompts: [{ promptId: 1, versionId: 2 }],
      baseEvaluationId: 7,
    });

    expect(response.status).toBe(201);
    expect(createAndStartMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ baseEvaluationId: 7 }),
      env.EVALUATION_WORKFLOW
    );
  });

  it("POST returns 400 for an invalid base evaluation id", async () => {
    const response = await send("/api/projects/1/evaluations", "POST", {
      name: "v1 vs v2",
      datasetId: 5,
      prompts: [{ promptId: 1, versionId: 2 }],
      baseEvaluationId: "abc",
    });

    expect(response.status).toBe(400);
    expect(createAndStartMock).not.toHaveBeenCalled();
  });
});
