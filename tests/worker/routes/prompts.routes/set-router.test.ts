import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getPromptByIdMock = vi.fn();
const setRouterVersionMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/prompt.service", () => ({
  PromptService: class {
    getPromptById = getPromptByIdMock;
    setRouterVersion = setRouterVersionMock;
  },
}));

describe("PUT /api/projects/:projectId/prompts/:promptId/router", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getPromptByIdMock.mockReset();
    setRouterVersionMock.mockReset();
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

  it("sets the router version for a prompt", async () => {
    setAuthenticatedUser(1);
    const prompt = {
      id: 1,
      name: "Prompt A",
      slug: "prompt-a",
      projectId: 1,
      tenantId: 1,
      provider: "openai",
      model: "gpt-4",
      latestVersion: 3,
      isActive: true,
      createdAt: 1000,
      updatedAt: 1000,
    };
    getPromptByIdMock.mockResolvedValue(prompt);
    setRouterVersionMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true, routerVersion: 2 });
    expect(getPromptByIdMock).toHaveBeenCalledWith(1, 1, 1);
    expect(setRouterVersionMock).toHaveBeenCalledWith(1, 1, 1, 2);
  });

  it("returns 404 when prompt does not exist", async () => {
    setAuthenticatedUser(1);
    getPromptByIdMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/prompts/999/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt not found" });
    expect(getPromptByIdMock).toHaveBeenCalledWith(1, 1, 999);
    expect(setRouterVersionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/prompts/1/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(setRouterVersionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid prompt ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/invalid/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(setRouterVersionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when version is missing", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Valid version number is required" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(setRouterVersionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when version is not a number", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "invalid" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Valid version number is required" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(setRouterVersionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when version is less than 1", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 0 }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Valid version number is required" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(setRouterVersionMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Authentication required" });
  });

  it("returns 401 when user has no valid tenant", async () => {
    setAuthenticatedUser(-1);

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
  });

  it("returns 500 when service throws error", async () => {
    setAuthenticatedUser(1);
    const prompt = {
      id: 1,
      name: "Prompt A",
      slug: "prompt-a",
      projectId: 1,
      tenantId: 1,
      provider: "openai",
      model: "gpt-4",
      latestVersion: 3,
      isActive: true,
      createdAt: 1000,
      updatedAt: 1000,
    };
    getPromptByIdMock.mockResolvedValue(prompt);
    setRouterVersionMock.mockRejectedValue(new Error("Version does not exist"));

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 5 }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Version does not exist" });
  });

  it("prevents cross-tenant router version setting", async () => {
    setAuthenticatedUser(1);
    getPromptByIdMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/2/prompts/5/router",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt not found" });
    expect(getPromptByIdMock).toHaveBeenCalledWith(1, 2, 5);
    expect(setRouterVersionMock).not.toHaveBeenCalled();
  });
});
