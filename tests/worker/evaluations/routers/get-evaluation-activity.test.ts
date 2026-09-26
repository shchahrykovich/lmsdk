import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker";

const mockGetSession = vi.fn();
const getEvaluationActivityMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/evaluations/evaluation.service", () => ({
  EvaluationService: class {
    getEvaluationActivity = getEvaluationActivityMock;
  },
}));

describe("Evaluations Routes - GET /api/projects/:projectId/evaluations/:evaluationId/activity", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    getEvaluationActivityMock.mockReset();
  });

  const setAuthenticatedUser = (tenantId = 1) => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com", tenantId },
      session: { id: "session-1", userId: "user-1", expiresAt: new Date(Date.now() + 1000000) },
    });
  };

  const request = (path: string) => app.request(path, {}, { DB: {} as any, PRIVATE_FILES: {} as any });

  it("returns the events and progress for the caller's tenant", async () => {
    setAuthenticatedUser(3);
    const activity = {
      events: [{ id: 2, type: "call_started", recordId: 5, promptId: 10, versionId: 100, details: { attempt: 1 }, createdAt: "2026-09-26T11:43:41.000Z" }],
      progress: { totalCalls: 20, succeededCalls: 0, sentAttempts: 1, failedAttempts: 0, lastEventAt: "2026-09-26T11:43:41.000Z" },
    };
    getEvaluationActivityMock.mockResolvedValue(activity);

    const response = await request("/api/projects/2/evaluations/10/activity");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(activity);
    expect(getEvaluationActivityMock).toHaveBeenCalledWith(expect.objectContaining({ id: 10, projectId: 2, tenantId: 3 }));
  });

  it("returns 404 when the evaluation is not found for the tenant", async () => {
    setAuthenticatedUser();
    getEvaluationActivityMock.mockResolvedValue(undefined);

    const response = await request("/api/projects/2/evaluations/10/activity");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "Evaluation not found" });
  });

  it("returns 400 for an invalid evaluation id", async () => {
    setAuthenticatedUser();

    const response = await request("/api/projects/2/evaluations/abc/activity");

    expect(response.status).toBe(400);
    expect(getEvaluationActivityMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await request("/api/projects/2/evaluations/10/activity");

    expect(response.status).toBe(401);
  });
});
