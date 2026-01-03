import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getPromptVersionMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/prompt.service", () => ({
  PromptService: class {
    getPromptVersion = getPromptVersionMock;
  },
}));

describe("GET /api/projects/:projectId/prompts/:promptId/versions/:version", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getPromptVersionMock.mockReset();
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

  it("returns a specific prompt version", async () => {
    setAuthenticatedUser(1);
    const promptVersion = {
      id: 2,
      promptId: 1,
      version: 2,
      body: '{"messages": [{"role": "user", "content": "test"}]}',
      createdAt: 2000,
    };
    getPromptVersionMock.mockResolvedValue(promptVersion);

    const response = await app.request(
      "/api/projects/1/prompts/1/versions/2",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.version).toEqual(promptVersion);
    expect(getPromptVersionMock).toHaveBeenCalledWith(1, 1, 1, 2);
  });

  it("returns 404 when prompt version is not found", async () => {
    setAuthenticatedUser(1);
    getPromptVersionMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/prompts/1/versions/999",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt version not found" });
    expect(getPromptVersionMock).toHaveBeenCalledWith(1, 1, 1, 999);
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/prompts/1/versions/1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project, prompt, or version ID" });
    expect(getPromptVersionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid prompt ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/invalid/versions/1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project, prompt, or version ID" });
    expect(getPromptVersionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid version ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/1/versions/invalid",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project, prompt, or version ID" });
    expect(getPromptVersionMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/1/versions/1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Authentication required" });
  });

  it("returns 401 when user has no valid tenant", async () => {
    setAuthenticatedUser(-1);

    const response = await app.request(
      "/api/projects/1/prompts/1/versions/1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
  });

  it("returns 500 when service throws error", async () => {
    setAuthenticatedUser(1);
    getPromptVersionMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/prompts/1/versions/1",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Failed to get prompt version" });
  });

  it("prevents cross-tenant access", async () => {
    setAuthenticatedUser(1);
    getPromptVersionMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/2/prompts/5/versions/2",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt version not found" });
    expect(getPromptVersionMock).toHaveBeenCalledWith(1, 2, 5, 2);
  });
});
