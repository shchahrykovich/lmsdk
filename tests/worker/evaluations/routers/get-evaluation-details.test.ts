import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker";

const mockGetSession = vi.fn();
const getEvaluationDetailsMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/evaluations/evaluation.service", () => ({
  EvaluationService: class {
    getEvaluationDetails = getEvaluationDetailsMock;
  },
}));

describe("Evaluations Routes - GET /api/projects/:projectId/evaluations/:evaluationId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getEvaluationDetailsMock.mockReset();
  });

  const setAuthenticatedUser = (tenantId = 1) => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        tenantId,
      },
      session: {
        id: "session-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 1000000),
      },
    });
  };

  const mockEvaluationDetails = {
    evaluation: {
      id: 1,
      tenantId: 1,
      projectId: 1,
      datasetId: 1,
      name: "Test Eval",
      slug: "test-eval",
      type: "run",
      state: "finished",
      workflowId: "workflow-1",
      durationMs: 1000,
      inputSchema: "{}",
      outputSchema: "{}",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    prompts: [
      { promptId: 10, versionId: 100 },
      { promptId: 11, versionId: 101 },
    ],
    results: [
      {
        recordId: 1,
        variables: '{"input":"test1"}',
        outputs: [
          {
            promptId: 10,
            versionId: 100,
            result: '{"content":"result1"}',
            durationMs: 500,
          },
          {
            promptId: 11,
            versionId: 101,
            result: '{"content":"result2"}',
            durationMs: 600,
          },
        ],
      },
    ],
  };

  it("should return evaluation details when valid projectId and evaluationId", async () => {
    setAuthenticatedUser();
    getEvaluationDetailsMock.mockResolvedValue(mockEvaluationDetails);

    const response = await app.request(
      "/api/projects/1/evaluations/1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.evaluation).toBeDefined();
    expect(data.evaluation.id).toBe(1);
    expect(data.prompts).toHaveLength(2);
    expect(data.results).toHaveLength(1);

    expect(getEvaluationDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        projectId: 1,
        tenantId: 1,
        userId: "user-1",
      })
    );
  });

  it("should return 404 when evaluation does not exist", async () => {
    setAuthenticatedUser();
    getEvaluationDetailsMock.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/evaluations/999",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Evaluation not found");
  });

  it("should return 400 for invalid project ID", async () => {
    setAuthenticatedUser();

    const response = await app.request(
      "/api/projects/invalid/evaluations/1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID");
  });

  it("should return 400 for invalid evaluation ID", async () => {
    setAuthenticatedUser();

    const response = await app.request(
      "/api/projects/1/evaluations/invalid",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid evaluation ID");
  });

  it("should filter by tenantId using authenticated user context", async () => {
    setAuthenticatedUser(1);
    getEvaluationDetailsMock.mockResolvedValue(mockEvaluationDetails);

    await app.request(
      "/api/projects/1/evaluations/1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(getEvaluationDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        projectId: 1,
        tenantId: 1,
        userId: "user-1",
      })
    );
  });

  it("should pass correct projectId from URL params", async () => {
    setAuthenticatedUser();
    getEvaluationDetailsMock.mockResolvedValue(mockEvaluationDetails);

    await app.request(
      "/api/projects/5/evaluations/1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(getEvaluationDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        projectId: 5,
        tenantId: 1,
        userId: "user-1",
      })
    );
  });

  it("should pass correct evaluationId from URL params", async () => {
    setAuthenticatedUser();
    getEvaluationDetailsMock.mockResolvedValue(mockEvaluationDetails);

    await app.request(
      "/api/projects/1/evaluations/42",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(getEvaluationDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        projectId: 1,
        tenantId: 1,
        userId: "user-1",
      })
    );
  });

  it("should return 500 when service throws an error", async () => {
    setAuthenticatedUser();
    getEvaluationDetailsMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/evaluations/1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Database error");
  });
});
