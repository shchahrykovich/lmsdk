import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getPromptByIdMock = vi.fn();
const deactivatePromptMock = vi.fn();

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
    deactivatePrompt = deactivatePromptMock;
  },
}));

describe("DELETE /api/projects/:projectId/prompts/:promptId", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getPromptByIdMock.mockReset();
    deactivatePromptMock.mockReset();
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

  it("deactivates an existing prompt", async () => {
    setAuthenticatedUser(1);
    const prompt = {
      id: 1,
      name: "Prompt A",
      slug: "prompt-a",
      projectId: 1,
      tenantId: 1,
      provider: "openai",
      model: "gpt-4",
      latestVersion: 1,
      isActive: true,
      createdAt: 1000,
      updatedAt: 1000,
    };
    getPromptByIdMock.mockResolvedValue(prompt);
    deactivatePromptMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/prompts/1",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true });
    expect(getPromptByIdMock).toHaveBeenCalledWith(1, 1, 1);
    expect(deactivatePromptMock).toHaveBeenCalledWith(1, 1, 1);
  });

  it("returns 404 when prompt does not exist", async () => {
    setAuthenticatedUser(1);
    getPromptByIdMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/prompts/999",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt not found" });
    expect(getPromptByIdMock).toHaveBeenCalledWith(1, 1, 999);
    expect(deactivatePromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/prompts/1",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(deactivatePromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid prompt ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/invalid",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(deactivatePromptMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/1",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Authentication required" });
  });

  it("returns 401 when user has no valid tenant", async () => {
    setAuthenticatedUser(-1);

    const response = await app.request(
      "/api/projects/1/prompts/1",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
  });

  it("returns 500 when service throws error during deactivation", async () => {
    setAuthenticatedUser(1);
    const prompt = {
      id: 1,
      name: "Prompt A",
      slug: "prompt-a",
      projectId: 1,
      tenantId: 1,
      provider: "openai",
      model: "gpt-4",
      latestVersion: 1,
      isActive: true,
      createdAt: 1000,
      updatedAt: 1000,
    };
    getPromptByIdMock.mockResolvedValue(prompt);
    deactivatePromptMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/prompts/1",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Failed to deactivate prompt" });
  });

  it("prevents cross-tenant deactivation", async () => {
    setAuthenticatedUser(1);
    getPromptByIdMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/2/prompts/5",
      { method: "DELETE" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt not found" });
    expect(getPromptByIdMock).toHaveBeenCalledWith(1, 2, 5);
    expect(deactivatePromptMock).not.toHaveBeenCalled();
  });
});
