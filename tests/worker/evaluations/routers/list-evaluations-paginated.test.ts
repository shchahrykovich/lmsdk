import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker";

const mockGetSession = vi.fn();
const getEvaluationsPaginatedMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/evaluations/evaluation.service", () => ({
  EvaluationService: class {
    getEvaluationsPaginated = getEvaluationsPaginatedMock;
  },
}));

describe("Evaluations Routes - GET /api/projects/:projectId/evaluations (Pagination)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getEvaluationsPaginatedMock.mockReset();
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

  it("should return paginated evaluations with default pagination", async () => {
    setAuthenticatedUser(1);
    getEvaluationsPaginatedMock.mockResolvedValue({
      evaluations: [
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
          datasetName: null,
          prompts: [],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const response = await app.request(
      "/api/projects/1/evaluations",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.evaluations).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(10);
    expect(data.totalPages).toBe(1);
    expect(getEvaluationsPaginatedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        tenantId: 1,
        userId: "user-123",
      }),
      1,
      10
    );
  });

  it("should accept custom page and pageSize parameters", async () => {
    setAuthenticatedUser(1);
    getEvaluationsPaginatedMock.mockResolvedValue({
      evaluations: [],
      total: 25,
      page: 2,
      pageSize: 5,
      totalPages: 5,
    });

    const response = await app.request(
      "/api/projects/1/evaluations?page=2&pageSize=5",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.page).toBe(2);
    expect(data.pageSize).toBe(5);
    expect(getEvaluationsPaginatedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        tenantId: 1,
        userId: "user-123",
      }),
      2,
      5
    );
  });

  it("should return 400 for invalid page number", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations?page=0",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid page number");
  });

  it("should return 400 for negative page number", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations?page=-1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid page number");
  });

  it("should return 400 for invalid pageSize", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations?pageSize=0",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid page size (must be between 1 and 200)");
  });

  it("should return 400 for pageSize exceeding maximum", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations?pageSize=201",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid page size (must be between 1 and 200)");
  });

  it("should return 400 for non-numeric page parameter", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations?page=abc",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid page number");
  });

  it("should return 400 for non-numeric pageSize parameter", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/evaluations?pageSize=abc",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid page size (must be between 1 and 200)");
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

  it("should enforce cross-tenant protection", async () => {
    setAuthenticatedUser(1);
    getEvaluationsPaginatedMock.mockResolvedValue({
      evaluations: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const response = await app.request(
      "/api/projects/1/evaluations",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(getEvaluationsPaginatedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        tenantId: 1,
        userId: "user-123",
      }),
      1,
      10
    );

    // Verify tenantId from session is used, not from request
    expect(getEvaluationsPaginatedMock.mock.calls[0][0].tenantId).toBe(1);
  });

  it("should handle large pageSize within limits", async () => {
    setAuthenticatedUser(1);
    getEvaluationsPaginatedMock.mockResolvedValue({
      evaluations: [],
      total: 0,
      page: 1,
      pageSize: 200,
      totalPages: 0,
    });

    const response = await app.request(
      "/api/projects/1/evaluations?pageSize=200",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.pageSize).toBe(200);
    expect(getEvaluationsPaginatedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        tenantId: 1,
        userId: "user-123",
      }),
      1,
      200
    );
  });
});
