import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../worker";

const mockGetSession = vi.fn();
const getProjectByIdMock = vi.fn();
const getProjectStatsMock = vi.fn();
const getTenantStatsMock = vi.fn();

vi.mock("../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../worker/projects/project.service", () => ({
  ProjectService: class {
    getProjectById = getProjectByIdMock;
  },
}));

vi.mock("../../../worker/projects/project-stats.service", () => ({
  ProjectStatsService: class {
    getProjectStats = getProjectStatsMock;
    getTenantStats = getTenantStatsMock;
  },
}));

const bindings = { DB: {} as any, PRIVATE_FILES: {} as any };

const stats = {
  prompts: 2,
  executions: {
    total: 5,
    succeeded: 4,
    failed: 1,
    avgDurationMs: 120,
    totalTokens: 900,
    costUsd: 1.5,
    unpricedCount: 0,
    lastExecutionAt: "2026-09-14T15:00:00.000Z",
  },
  traces: 3,
  datasets: 1,
  datasetRecords: 10,
  evaluations: 1,
};

const daily = [{ date: "2026-09-14", total: 5, failed: 1 }];

describe("Projects Stats Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getProjectByIdMock.mockReset();
    getProjectStatsMock.mockReset();
    getTenantStatsMock.mockReset();
  });

  const setAuthenticatedUser = (tenantId = 1) => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-123", name: "Test User", email: "test@example.com", tenantId },
      session: { id: "session-123" },
    });
  };

  describe("GET /api/projects/stats", () => {
    it("returns tenant stats for the user's tenant", async () => {
      setAuthenticatedUser(7);
      getTenantStatsMock.mockResolvedValue({ totals: stats, daily, projects: [{ projectId: 1, stats }] });

      const response = await app.request("/api/projects/stats", {}, bindings);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ totals: stats, daily, projects: [{ projectId: 1, stats }] });
      expect(getTenantStatsMock).toHaveBeenCalledWith(7);
      expect(getProjectByIdMock).not.toHaveBeenCalled();
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request("/api/projects/stats", {}, bindings);

      expect(response.status).toBe(401);
      expect(getTenantStatsMock).not.toHaveBeenCalled();
    });

    it("returns 401 when user has no valid tenant", async () => {
      setAuthenticatedUser(-1);

      const response = await app.request("/api/projects/stats", {}, bindings);

      expect(response.status).toBe(401);
      expect(getTenantStatsMock).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/projects/:id/stats", () => {
    it("returns stats for a project of the user's tenant", async () => {
      setAuthenticatedUser(1);
      getProjectByIdMock.mockResolvedValue({ id: 5, tenantId: 1 });
      getProjectStatsMock.mockResolvedValue({ stats, daily });

      const response = await app.request("/api/projects/5/stats", {}, bindings);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ stats, daily });
      expect(getProjectStatsMock).toHaveBeenCalledWith(expect.objectContaining({ id: 5, tenantId: 1 }));
    });

    it("returns 404 when the project does not belong to the tenant", async () => {
      setAuthenticatedUser(1);
      getProjectByIdMock.mockResolvedValue(undefined);

      const response = await app.request("/api/projects/5/stats", {}, bindings);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Project not found" });
      expect(getProjectByIdMock).toHaveBeenCalledWith(expect.objectContaining({ id: 5, tenantId: 1 }));
      expect(getProjectStatsMock).not.toHaveBeenCalled();
    });

    it("returns 400 for an invalid project ID", async () => {
      setAuthenticatedUser(1);

      const response = await app.request("/api/projects/abc/stats", {}, bindings);

      expect(response.status).toBe(400);
      expect(getProjectStatsMock).not.toHaveBeenCalled();
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request("/api/projects/5/stats", {}, bindings);

      expect(response.status).toBe(401);
      expect(getProjectStatsMock).not.toHaveBeenCalled();
    });
  });
});
