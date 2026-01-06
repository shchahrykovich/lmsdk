import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getEvaluationsMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/evaluation.service", () => ({
  EvaluationService: class {
    getEvaluations = getEvaluationsMock;
  },
}));

describe("Evaluations Routes - GET /api/projects/:projectId/evaluations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getEvaluationsMock.mockReset();
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

  it("should return list of evaluations for authenticated user", async () => {
    setAuthenticatedUser(1);
    getEvaluationsMock.mockResolvedValue([
      {
        id: 1,
        tenantId: 1,
        projectId: 1,
        name: "Eval A",
        slug: "eval-a",
        type: "run",
        state: "finished",
        durationMs: 1200,
        inputSchema: "{}",
        outputSchema: "{}",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 2,
        tenantId: 1,
        projectId: 1,
        name: "Eval B",
        slug: "eval-b",
        type: "comparison",
        state: "running",
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
        createdAt: 1100,
        updatedAt: 1100,
      },
    ]);

    const response = await app.request(
      "/api/projects/1/evaluations",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.evaluations).toHaveLength(2);
    expect(data.evaluations[0].name).toBe("Eval A");
    expect(data.evaluations[1].name).toBe("Eval B");
    expect(getEvaluationsMock).toHaveBeenCalledWith({
      tenantId: 1,
      projectId: 1,
    });
  });

  it("should return 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/evaluations",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID");
  });

  it("should return 401 for unauthenticated user", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/evaluations",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
  });
});
