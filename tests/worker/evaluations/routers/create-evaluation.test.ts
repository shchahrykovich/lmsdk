import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker";
import { ConflictError } from "../../../../worker/shared/errors";

const mockGetSession = vi.fn();
const createEvaluationMock = vi.fn();
const setWorkflowIdMock = vi.fn();
const workflowCreateMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/evaluations/evaluation.service", () => ({
  EvaluationService: class {
    createEvaluation = createEvaluationMock;
    setWorkflowId = setWorkflowIdMock;
  },
}));

describe("Evaluations Routes - POST /api/projects/:projectId/evaluations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    createEvaluationMock.mockReset();
    setWorkflowIdMock.mockReset();
    workflowCreateMock.mockReset();
  });

  const setAuthenticatedUser = (tenantId = 1) => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: { id: "session-123" },
    });
  };

  it("should create an evaluation for authenticated user", async () => {
    setAuthenticatedUser(1);
    createEvaluationMock.mockResolvedValue({
      id: 10,
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Eval A",
      slug: "eval-a",
      type: "comparison",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });
    workflowCreateMock.mockResolvedValue({ id: "workflow-123" });
    setWorkflowIdMock.mockResolvedValue({
      id: 10,
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Eval A",
      slug: "eval-a",
      type: "comparison",
      state: "created",
      workflowId: "workflow-123",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: " Eval A ",
          type: "comparison",
          datasetId: 5,
          prompts: [{ promptId: "1", versionId: "2" }],
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.evaluation.name).toBe("Eval A");
    expect(data.evaluation.datasetId).toBe(5);
    expect(data.evaluation.workflowId).toBe("workflow-123");
    expect(createEvaluationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        tenantId: 1,
        userId: "user-123",
      }),
      {
        name: "Eval A",
        type: "comparison",
        datasetId: 5,
        prompts: [{ promptId: 1, versionId: 2 }],
      }
    );
    expect(workflowCreateMock).toHaveBeenCalledWith({
      params: {
        tenantId: 1,
        projectId: 1,
        evaluationId: 10,
        startedAtMs: expect.any(Number),
        userId: "user-123",
      },
    });
    expect(setWorkflowIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        projectId: 1,
        tenantId: 1,
        userId: "user-123",
      }),
      "workflow-123"
    );
  });

  it("should return 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          datasetId: 5,
          prompts: [{ promptId: 1, versionId: 1 }]
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(400);
  });

  it("should return 400 when name is missing", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId: 5,
          prompts: [{ promptId: 1, versionId: 1 }]
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(400);
  });

  it("should return 400 when no valid prompts are provided", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          datasetId: 5,
          prompts: [{ promptId: "x" }]
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(400);
  });

  it("should return 409 when evaluation name already exists", async () => {
    setAuthenticatedUser(1);
    createEvaluationMock.mockRejectedValue(new ConflictError("Evaluation name already exists"));

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          datasetId: 5,
          prompts: [{ promptId: 1, versionId: 1 }],
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(409);
  });

  it("should return 500 when workflow creation fails", async () => {
    setAuthenticatedUser(1);
    createEvaluationMock.mockResolvedValue({
      id: 10,
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Eval A",
      slug: "eval-a",
      type: "comparison",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });
    workflowCreateMock.mockRejectedValue(new Error("Workflow unavailable"));

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          datasetId: 5,
          prompts: [{ promptId: 1, versionId: 1 }],
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(500);
  });

  it("should return 500 when updating workflow id fails", async () => {
    setAuthenticatedUser(1);
    createEvaluationMock.mockResolvedValue({
      id: 10,
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Eval A",
      slug: "eval-a",
      type: "comparison",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });
    workflowCreateMock.mockResolvedValue({ id: "workflow-123" });
    setWorkflowIdMock.mockRejectedValue(new Error("Evaluation not found"));

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          datasetId: 5,
          prompts: [{ promptId: 1, versionId: 1 }],
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(500);
  });

  it("should return 401 for unauthenticated user", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          datasetId: 5,
          prompts: [{ promptId: 1, versionId: 1 }],
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(401);
  });

  it("should return 400 when datasetId is missing", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          prompts: [{ promptId: 1, versionId: 1 }],
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Valid dataset ID is required");
  });

  it("should return 400 when datasetId is invalid", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          datasetId: "invalid",
          prompts: [{ promptId: 1, versionId: 1 }],
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Valid dataset ID is required");
  });

  it("should return 400 when datasetId is zero", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          datasetId: 0,
          prompts: [{ promptId: 1, versionId: 1 }],
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Valid dataset ID is required");
  });

  it("should return 400 when datasetId is negative", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          datasetId: -5,
          prompts: [{ promptId: 1, versionId: 1 }],
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Valid dataset ID is required");
  });

  it("should return 400 when more than 3 prompts are provided", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Eval A",
          datasetId: 5,
          prompts: [
            { promptId: 1, versionId: 1 },
            { promptId: 2, versionId: 2 },
            { promptId: 3, versionId: 3 },
            { promptId: 4, versionId: 4 },
          ],
        }),
      },
      {
        DB: {} as any,
        PRIVATE_FILES: {} as any,
        EVALUATION_WORKFLOW: { create: workflowCreateMock } as any,
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Maximum of 3 prompts allowed");
  });
});
