import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const updatePromptMock = vi.fn();
const getPromptByIdMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/prompt.service", () => ({
  PromptService: class {
    updatePrompt = updatePromptMock;
    getPromptById = getPromptByIdMock;
  },
}));

describe("PUT /api/projects/:projectId/prompts/:promptId", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    updatePromptMock.mockReset();
    getPromptByIdMock.mockReset();
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

  it("updates a prompt and returns the updated version", async () => {
    setAuthenticatedUser(1);
    const updatedPrompt = {
      id: 1,
      name: "Updated Prompt",
      slug: "prompt-a",
      projectId: 1,
      tenantId: 1,
      provider: "anthropic",
      model: "claude-3",
      latestVersion: 2,
      isActive: true,
      createdAt: 1000,
      updatedAt: 2000,
    };
    updatePromptMock.mockResolvedValue(undefined);
    getPromptByIdMock.mockResolvedValue(updatedPrompt);

    const response = await app.request(
      "/api/projects/1/prompts/1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated Prompt",
          provider: "anthropic",
          model: "claude-3",
          body: '{"messages": [{"role": "user", "content": "test"}]}',
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.prompt).toEqual(updatedPrompt);
    expect(updatePromptMock).toHaveBeenCalledWith(1, 1, 1, {
      name: "Updated Prompt",
      provider: "anthropic",
      model: "claude-3",
      body: '{"messages": [{"role": "user", "content": "test"}]}',
    });
    expect(getPromptByIdMock).toHaveBeenCalledWith(1, 1, 1);
  });

  it("updates prompt with partial fields", async () => {
    setAuthenticatedUser(1);
    const updatedPrompt = {
      id: 1,
      name: "Updated Name Only",
      slug: "prompt-a",
      projectId: 1,
      tenantId: 1,
      provider: "openai",
      model: "gpt-4",
      latestVersion: 2,
      isActive: true,
      createdAt: 1000,
      updatedAt: 2000,
    };
    updatePromptMock.mockResolvedValue(undefined);
    getPromptByIdMock.mockResolvedValue(updatedPrompt);

    const response = await app.request(
      "/api/projects/1/prompts/1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated Name Only",
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(updatePromptMock).toHaveBeenCalledWith(1, 1, 1, {
      name: "Updated Name Only",
      provider: undefined,
      model: undefined,
      body: undefined,
    });
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/prompts/1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(updatePromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid prompt ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/invalid",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(updatePromptMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
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
      "/api/projects/1/prompts/1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
  });

  it("returns 500 when service throws error", async () => {
    setAuthenticatedUser(1);
    updatePromptMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/prompts/1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Failed to update prompt" });
  });
});
