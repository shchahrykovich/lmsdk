import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../worker/index";

const mockGetSession = vi.fn();
const listProjectLogsMock = vi.fn();
const getProjectLogDetailsMock = vi.fn();
const getUniquePromptsForProjectMock = vi.fn();
const getUniqueVariablePathsForProjectMock = vi.fn();

vi.mock("../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../worker/services/logs.service", () => ({
  LogService: class {
    listProjectLogs = listProjectLogsMock;
    getProjectLogDetails = getProjectLogDetailsMock;
    getUniquePromptsForProject = getUniquePromptsForProjectMock;
    getUniqueVariablePathsForProject = getUniqueVariablePathsForProjectMock;
  },
}));

describe("Logs Routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    listProjectLogsMock.mockReset();
    getProjectLogDetailsMock.mockReset();
    getUniquePromptsForProjectMock.mockReset();
    getUniqueVariablePathsForProjectMock.mockReset();
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

  it("returns logs for a project with default pagination", async () => {
    setAuthenticatedUser(1);
    const projectId = 42;
    listProjectLogsMock.mockResolvedValue({
      logs: [
        {
          id: 1,
          promptId: 10,
          version: 2,
          logPath: "logs/a",
          isSuccess: true,
          errorMessage: null,
          durationMs: 120,
          createdAt: 1000,
          promptName: "Prompt A",
          promptSlug: "prompt-a",
          provider: "openai",
          model: "gpt-4",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const response = await app.request(
      `/api/projects/${projectId}/logs`,
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.logs).toHaveLength(1);
    expect(data.logs[0].promptName).toBe("Prompt A");
    expect(data.logs[0].promptSlug).toBe("prompt-a");
    expect(listProjectLogsMock).toHaveBeenCalledWith(1, projectId, 1, 10, undefined, undefined);
  });

  it("returns log details with stored files", async () => {
    setAuthenticatedUser(1);
    const projectId = 12;
    const logPath = "logs/1/2024-01-01/1/1/1/99";
    const logId = 99;
    getProjectLogDetailsMock.mockResolvedValue({
      log: {
        id: logId,
        promptId: 10,
        version: 1,
        logPath,
        isSuccess: false,
        errorMessage: "Failed",
        durationMs: 42,
        createdAt: 1200,
        promptName: "Prompt A",
        promptSlug: "prompt-a",
        provider: "openai",
        model: "gpt-4",
      },
      files: {
        metadata: { meta: true },
        input: { input: "value" },
        output: { output: "value" },
        variables: { vars: { key: "value" } },
      },
    });

    const response = await app.request(
      `/api/projects/${projectId}/logs/${logId}`,
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.log.id).toBe(logId);
    expect(data.files.metadata).toEqual({ meta: true });
    expect(data.files.input).toEqual({ input: "value" });
    expect(data.files.output).toEqual({ output: "value" });
    expect(data.files.variables).toEqual({ vars: { key: "value" } });
    expect(getProjectLogDetailsMock).toHaveBeenCalledWith(1, projectId, logId);
  });

  it("returns logs with pagination parameters", async () => {
    setAuthenticatedUser(1);
    const projectId = 42;
    listProjectLogsMock.mockResolvedValue({
      logs: [],
      total: 100,
      page: 2,
      pageSize: 20,
      totalPages: 5,
    });

    const response = await app.request(
      `/api/projects/${projectId}/logs?page=2&pageSize=20`,
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.page).toBe(2);
    expect(data.pageSize).toBe(20);
    expect(listProjectLogsMock).toHaveBeenCalledWith(1, projectId, 2, 20, undefined, undefined);
  });

  it("returns logs filtered by success status", async () => {
    setAuthenticatedUser(1);
    const projectId = 42;
    listProjectLogsMock.mockResolvedValue({
      logs: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const response = await app.request(
      `/api/projects/${projectId}/logs?isSuccess=true`,
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(listProjectLogsMock).toHaveBeenCalledWith(
      1,
      projectId,
      1,
      10,
      { isSuccess: true },
      undefined
    );
  });

  it("returns logs filtered by promptId and version", async () => {
    setAuthenticatedUser(1);
    const projectId = 42;
    listProjectLogsMock.mockResolvedValue({
      logs: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const response = await app.request(
      `/api/projects/${projectId}/logs?promptId=5&version=3`,
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(listProjectLogsMock).toHaveBeenCalledWith(
      1,
      projectId,
      1,
      10,
      { promptId: 5, version: 3 },
      undefined
    );
  });

  it("returns logs with sorting parameters", async () => {
    setAuthenticatedUser(1);
    const projectId = 42;
    listProjectLogsMock.mockResolvedValue({
      logs: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const response = await app.request(
      `/api/projects/${projectId}/logs?sortField=durationMs&sortDirection=asc`,
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(listProjectLogsMock).toHaveBeenCalledWith(
      1,
      projectId,
      1,
      10,
      undefined,
      { field: "durationMs", direction: "asc" }
    );
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      `/api/projects/invalid/logs`,
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project ID" });
  });

  it("returns unique prompts for a project", async () => {
    setAuthenticatedUser(1);
    const projectId = 42;
    getUniquePromptsForProjectMock.mockResolvedValue([
      { promptId: 1, promptName: "Prompt A", version: 1 },
      { promptId: 1, promptName: "Prompt A", version: 2 },
      { promptId: 2, promptName: "Prompt B", version: 1 },
    ]);

    const response = await app.request(
      `/api/projects/${projectId}/logs/prompts`,
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.prompts).toHaveLength(3);
    expect(data.prompts[0].promptName).toBe("Prompt A");
    expect(data.prompts[0].version).toBe(1);
    expect(getUniquePromptsForProjectMock).toHaveBeenCalledWith(1, projectId);
  });

  it("returns 400 for invalid project ID when fetching prompts", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      `/api/projects/invalid/logs/prompts`,
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project ID" });
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await app.request(
      "/api/projects/1/logs",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Authentication required" });
  });

  it("returns 401 when user has no valid tenant", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: -1, // Invalid tenant
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: { id: "session-123" },
    });

    const response = await app.request(
      "/api/projects/1/logs",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
  });

  describe("Variable Paths Endpoint", () => {
    it("returns unique variable paths for a project", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      getUniqueVariablePathsForProjectMock.mockResolvedValue([
        "user.name",
        "user.email",
        "config.apiUrl",
      ]);

      const response = await app.request(
        `/api/projects/${projectId}/logs/variables`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.variablePaths).toHaveLength(3);
      expect(data.variablePaths).toContain("user.name");
      expect(data.variablePaths).toContain("user.email");
      expect(data.variablePaths).toContain("config.apiUrl");
      expect(getUniqueVariablePathsForProjectMock).toHaveBeenCalledWith(1, projectId);
    });

    it("returns empty array when no variable paths exist", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      getUniqueVariablePathsForProjectMock.mockResolvedValue([]);

      const response = await app.request(
        `/api/projects/${projectId}/logs/variables`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.variablePaths).toEqual([]);
      expect(getUniqueVariablePathsForProjectMock).toHaveBeenCalledWith(1, projectId);
    });

    it("returns 400 for invalid project ID when fetching variables", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        `/api/projects/invalid/logs/variables`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid project ID" });
    });

    it("returns 500 when service throws error", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      getUniqueVariablePathsForProjectMock.mockRejectedValue(new Error("Database error"));

      const response = await app.request(
        `/api/projects/${projectId}/logs/variables`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to fetch variable paths" });
    });
  });

  describe("Variable Filtering", () => {
    it("returns logs filtered by variable path with contains operator", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectLogsMock.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const response = await app.request(
        `/api/projects/${projectId}/logs?variablePath=user.name&variableValue=Alice&variableOperator=contains`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      expect(listProjectLogsMock).toHaveBeenCalledWith(
        1,
        projectId,
        1,
        10,
        {
          variablePath: "user.name",
          variableValue: "Alice",
          variableOperator: "contains",
        },
        undefined
      );
    });

    it("returns logs filtered by variable path with notEmpty operator", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectLogsMock.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const response = await app.request(
        `/api/projects/${projectId}/logs?variablePath=user.name&variableOperator=notEmpty`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      expect(listProjectLogsMock).toHaveBeenCalledWith(
        1,
        projectId,
        1,
        10,
        {
          variablePath: "user.name",
          variableOperator: "notEmpty",
        },
        undefined
      );
    });

    it("returns logs filtered by variable path only (without operator)", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectLogsMock.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const response = await app.request(
        `/api/projects/${projectId}/logs?variablePath=user.email`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      expect(listProjectLogsMock).toHaveBeenCalledWith(
        1,
        projectId,
        1,
        10,
        { variablePath: "user.email" },
        undefined
      );
    });

    it("returns logs with combined filters (status + variable)", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectLogsMock.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const response = await app.request(
        `/api/projects/${projectId}/logs?isSuccess=true&variablePath=user.name&variableValue=Bob&variableOperator=contains`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      expect(listProjectLogsMock).toHaveBeenCalledWith(
        1,
        projectId,
        1,
        10,
        {
          isSuccess: true,
          variablePath: "user.name",
          variableValue: "Bob",
          variableOperator: "contains",
        },
        undefined
      );
    });
  });

  describe("Log Details Endpoint", () => {
    it("returns 404 when log is not found", async () => {
      setAuthenticatedUser(1);
      const projectId = 12;
      const logId = 999;
      getProjectLogDetailsMock.mockResolvedValue({
        log: null,
        files: null,
      });

      const response = await app.request(
        `/api/projects/${projectId}/logs/${logId}`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "Log not found" });
      expect(getProjectLogDetailsMock).toHaveBeenCalledWith(1, projectId, logId);
    });

    it("returns 400 for invalid log ID", async () => {
      setAuthenticatedUser(1);
      const projectId = 12;

      const response = await app.request(
        `/api/projects/${projectId}/logs/invalid`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid project or log ID" });
    });

    it("returns 500 when service throws error", async () => {
      setAuthenticatedUser(1);
      const projectId = 12;
      const logId = 99;
      getProjectLogDetailsMock.mockRejectedValue(new Error("R2 error"));

      const response = await app.request(
        `/api/projects/${projectId}/logs/${logId}`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to get log" });
    });
  });

  describe("Error Handling", () => {
    it("returns 500 when listing logs fails", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      listProjectLogsMock.mockRejectedValue(new Error("Database connection failed"));

      const response = await app.request(
        `/api/projects/${projectId}/logs`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to list logs" });
    });

    it("returns 500 when fetching unique prompts fails", async () => {
      setAuthenticatedUser(1);
      const projectId = 42;
      getUniquePromptsForProjectMock.mockRejectedValue(new Error("Query failed"));

      const response = await app.request(
        `/api/projects/${projectId}/logs/prompts`,
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to fetch prompts" });
    });
  });
});
