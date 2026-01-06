import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../worker/index";

const mockGetSession = vi.fn();
const listProjectTracesMock = vi.fn();
const getTraceDetailsMock = vi.fn();

vi.mock("../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../worker/services/traces.service", () => ({
  TraceService: class {
    listProjectTraces = listProjectTracesMock;
    getTraceDetails = getTraceDetailsMock;
  },
}));

describe("Traces Routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    listProjectTracesMock.mockReset();
    getTraceDetailsMock.mockReset();
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

  describe("GET /api/projects/:projectId/traces", () => {
    it("returns traces for a project with default pagination", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectTracesMock.mockResolvedValue({
        traces: [
          {
            id: 1,
            traceId: "trace-abc-123",
            totalLogs: 5,
            successCount: 4,
            errorCount: 1,
            totalDurationMs: 1500,
            firstLogAt: new Date(1000),
            lastLogAt: new Date(2000),
            tracePath: "traces/1/2024-01-01/42/trace-abc-123",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });

      const response = await app.request(
        `/api/projects/${projectId}/traces`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.traces).toHaveLength(1);
      expect(data.traces[0].traceId).toBe("trace-abc-123");
      expect(data.traces[0].totalLogs).toBe(5);
      expect(listProjectTracesMock).toHaveBeenCalledWith({
        tenantId: 1,
        projectId: projectId,
        page: 1,
        pageSize: 10,
        sort: undefined,
      });
    });

    it("returns traces with pagination parameters", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectTracesMock.mockResolvedValue({
        traces: [],
        total: 100,
        page: 2,
        pageSize: 20,
        totalPages: 5,
      });

      const response = await app.request(
        `/api/projects/${projectId}/traces?page=2&pageSize=20`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.page).toBe(2);
      expect(data.pageSize).toBe(20);
      expect(listProjectTracesMock).toHaveBeenCalledWith({
        tenantId: 1,
        projectId: projectId,
        page: 2,
        pageSize: 20,
        sort: undefined,
      });
    });

    it("returns traces with sorting by createdAt", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectTracesMock.mockResolvedValue({
        traces: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const response = await app.request(
        `/api/projects/${projectId}/traces?sortField=createdAt&sortDirection=asc`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      expect(listProjectTracesMock).toHaveBeenCalledWith({
        tenantId: 1,
        projectId: projectId,
        page: 1,
        pageSize: 10,
        sort: { field: "createdAt", direction: "asc" },
      });
    });

    it("returns traces with sorting by totalLogs descending", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectTracesMock.mockResolvedValue({
        traces: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const response = await app.request(
        `/api/projects/${projectId}/traces?sortField=totalLogs&sortDirection=desc`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      expect(listProjectTracesMock).toHaveBeenCalledWith({
        tenantId: 1,
        projectId: projectId,
        page: 1,
        pageSize: 10,
        sort: { field: "totalLogs", direction: "desc" },
      });
    });

    it("returns traces with sorting by totalDurationMs", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectTracesMock.mockResolvedValue({
        traces: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const response = await app.request(
        `/api/projects/${projectId}/traces?sortField=totalDurationMs&sortDirection=asc`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      expect(listProjectTracesMock).toHaveBeenCalledWith({
        tenantId: 1,
        projectId: projectId,
        page: 1,
        pageSize: 10,
        sort: { field: "totalDurationMs", direction: "asc" },
      });
    });

    it("defaults to desc when sortDirection is not provided", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectTracesMock.mockResolvedValue({
        traces: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const response = await app.request(
        `/api/projects/${projectId}/traces?sortField=createdAt`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      expect(listProjectTracesMock).toHaveBeenCalledWith({
        tenantId: 1,
        projectId: projectId,
        page: 1,
        pageSize: 10,
        sort: { field: "createdAt", direction: "desc" },
      });
    });

    it("returns 400 for invalid project ID", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        `/api/projects/invalid/traces`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid project ID" });
      expect(listProjectTracesMock).not.toHaveBeenCalled();
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request(
        "/api/projects/1/traces",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Authentication required" });
      expect(listProjectTracesMock).not.toHaveBeenCalled();
    });

    it("returns 401 when user has no valid tenant", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "user-123",
          name: "Test User",
          email: "test@example.com",
          tenantId: -1,
          emailVerified: true,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        session: { id: "session-123" },
      });

      const response = await app.request(
        "/api/projects/1/traces",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
      expect(listProjectTracesMock).not.toHaveBeenCalled();
    });

    it("returns 500 when service throws error", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectTracesMock.mockRejectedValue(new Error("Database error"));

      const response = await app.request(
        `/api/projects/${projectId}/traces`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to list traces" });
    });

    it("handles empty results correctly", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectTracesMock.mockResolvedValue({
        traces: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const response = await app.request(
        `/api/projects/${projectId}/traces`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.traces).toEqual([]);
      expect(data.total).toBe(0);
    });
  });

  describe("GET /api/projects/:projectId/traces/:traceId", () => {
    it("returns trace details with logs", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      const traceId = "trace-abc-123";

      getTraceDetailsMock.mockResolvedValue({
        trace: {
          id: 1,
          traceId: "trace-abc-123",
          totalLogs: 3,
          successCount: 2,
          errorCount: 1,
          totalDurationMs: 1200,
          firstLogAt: new Date(1000),
          lastLogAt: new Date(3000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        logs: [
          {
            id: 1,
            tenantId: 1,
            projectId: 42,
            promptId: 10,
            version: 1,
            isSuccess: true,
            errorMessage: null,
            durationMs: 400,
            traceId: "trace-abc-123",
            rawTraceId: "raw-trace-1",
            promptName: "Test Prompt",
            promptSlug: "test-prompt",
            createdAt: new Date(1000),
          },
          {
            id: 2,
            tenantId: 1,
            projectId: 42,
            promptId: 10,
            version: 1,
            isSuccess: true,
            errorMessage: null,
            durationMs: 500,
            traceId: "trace-abc-123",
            rawTraceId: "raw-trace-2",
            promptName: "Test Prompt",
            promptSlug: "test-prompt",
            createdAt: new Date(2000),
          },
          {
            id: 3,
            tenantId: 1,
            projectId: 42,
            promptId: 10,
            version: 1,
            isSuccess: false,
            errorMessage: "API Error",
            durationMs: 300,
            traceId: "trace-abc-123",
            rawTraceId: "raw-trace-3",
            promptName: "Test Prompt",
            promptSlug: "test-prompt",
            createdAt: new Date(3000),
          },
        ],
      });

      const response = await app.request(
        `/api/projects/${projectId}/traces/${traceId}`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.trace.traceId).toBe("trace-abc-123");
      expect(data.trace.totalLogs).toBe(3);
      expect(data.logs).toHaveLength(3);
      expect(data.logs[0].isSuccess).toBe(true);
      expect(data.logs[2].errorMessage).toBe("API Error");
      expect(getTraceDetailsMock).toHaveBeenCalledWith(1, projectId, traceId);
    });

    it("returns 404 when trace is not found", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      const traceId = "non-existent-trace";

      getTraceDetailsMock.mockResolvedValue({
        trace: null,
        logs: [],
      });

      const response = await app.request(
        `/api/projects/${projectId}/traces/${traceId}`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "Trace not found" });
      expect(getTraceDetailsMock).toHaveBeenCalledWith(1, projectId, traceId);
    });

    it("returns 400 for invalid project ID", async () => {
      setAuthenticatedUser(1);
      const traceId = "trace-abc-123";

      const response = await app.request(
        `/api/projects/invalid/traces/${traceId}`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid project ID" });
      expect(getTraceDetailsMock).not.toHaveBeenCalled();
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);
      const traceId = "trace-abc-123";

      const response = await app.request(
        "/api/projects/1/traces/" + traceId,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Authentication required" });
      expect(getTraceDetailsMock).not.toHaveBeenCalled();
    });

    it("returns 401 when user has no valid tenant", async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: "user-123",
          name: "Test User",
          email: "test@example.com",
          tenantId: -1,
          emailVerified: true,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        session: { id: "session-123" },
      });
      const traceId = "trace-abc-123";

      const response = await app.request(
        "/api/projects/1/traces/" + traceId,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
      expect(getTraceDetailsMock).not.toHaveBeenCalled();
    });

    it("returns 500 when service throws error", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      const traceId = "trace-abc-123";
      getTraceDetailsMock.mockRejectedValue(new Error("Database error"));

      const response = await app.request(
        `/api/projects/${projectId}/traces/${traceId}`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to get trace details" });
    });
  });

  describe("Cross-tenant Protection", () => {
    it("passes correct tenantId from authenticated user to service for listing traces", async () => {
      setAuthenticatedUser(5);
      const projectId = 42;
      listProjectTracesMock.mockResolvedValue({
        traces: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      await app.request(
        `/api/projects/${projectId}/traces`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(listProjectTracesMock).toHaveBeenCalledWith({
        tenantId: 5,
        projectId: projectId,
        page: 1,
        pageSize: 10,
        sort: undefined,
      });
    });

    it("passes correct tenantId from authenticated user to service for trace details", async () => {
      setAuthenticatedUser(7);
      const projectId = 42;
      const traceId = "trace-abc-123";
      getTraceDetailsMock.mockResolvedValue({
        trace: null,
        logs: [],
      });

      await app.request(
        `/api/projects/${projectId}/traces/${traceId}`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(getTraceDetailsMock).toHaveBeenCalledWith(7, projectId, traceId);
    });
  });
});
