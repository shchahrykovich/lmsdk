import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker";
import { NotFoundError } from "../../../../worker/shared/errors";

const mockGetSession = vi.fn();
const deleteEvaluationMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/evaluations/evaluation.service", () => ({
  EvaluationService: class {
    deleteEvaluation = deleteEvaluationMock;
  },
}));

describe("Evaluations Routes - DELETE /api/projects/:projectId/evaluations/:evaluationId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    deleteEvaluationMock.mockReset();
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

  it("should delete evaluation for authenticated user", async () => {
    setAuthenticatedUser(1);
    deleteEvaluationMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/evaluations/5",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(deleteEvaluationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 5,
        projectId: 1,
        tenantId: 1,
        userId: "user-123",
      })
    );
  });

  it("should return 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/evaluations/5",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID");
  });

  it("should return 400 for invalid evaluation ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations/invalid",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid evaluation ID");
  });

  it("should return 404 when evaluation not found", async () => {
    setAuthenticatedUser(1);
    deleteEvaluationMock.mockRejectedValue(new NotFoundError("Evaluation not found"));

    const response = await app.request(
      "/api/projects/1/evaluations/999",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Evaluation not found");
  });

  it("should return 401 for unauthenticated user", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/evaluations/5",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
  });
});
