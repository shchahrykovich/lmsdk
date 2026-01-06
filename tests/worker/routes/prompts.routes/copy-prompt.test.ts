import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getPromptByIdMock = vi.fn();
const copyPromptMock = vi.fn();

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
    copyPrompt = copyPromptMock;
  },
}));

describe("POST /api/projects/:projectId/prompts/:promptId/copy", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getPromptByIdMock.mockReset();
    copyPromptMock.mockReset();
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

  it("copies a prompt successfully", async () => {
    setAuthenticatedUser(1);
    const sourcePrompt = {
      id: 1,
      name: "Original Prompt",
      slug: "original-prompt",
      projectId: 1,
      tenantId: 1,
      provider: "openai",
      model: "gpt-4",
      body: '{"messages": []}',
      latestVersion: 1,
      isActive: true,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const copiedPrompt = {
      id: 2,
      name: "Original Prompt Copy",
      slug: "original-prompt-copy",
      projectId: 1,
      tenantId: 1,
      provider: "openai",
      model: "gpt-4",
      body: '{"messages": []}',
      latestVersion: 1,
      isActive: true,
      createdAt: 2000,
      updatedAt: 2000,
    };

    getPromptByIdMock.mockResolvedValue(sourcePrompt);
    copyPromptMock.mockResolvedValue(copiedPrompt);

    const response = await app.request(
      "/api/projects/1/prompts/1/copy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.prompt).toEqual(copiedPrompt);
    expect(getPromptByIdMock).toHaveBeenCalledWith(1, 1, 1);
    expect(copyPromptMock).toHaveBeenCalledWith(1, 1, 1);
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/prompts/1/copy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(copyPromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid prompt ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/invalid/copy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(copyPromptMock).not.toHaveBeenCalled();
  });

  it("returns 404 when source prompt not found", async () => {
    setAuthenticatedUser(1);
    getPromptByIdMock.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/999/copy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Source prompt not found" });
    expect(getPromptByIdMock).toHaveBeenCalledWith(1, 1, 999);
    expect(copyPromptMock).not.toHaveBeenCalled();
  });

  it("enforces cross-tenant protection - cannot copy prompt from different tenant", async () => {
    setAuthenticatedUser(2);
    // Prompt belongs to tenant 1, but user is tenant 2
    getPromptByIdMock.mockResolvedValue(null); // Won't find it due to tenant filtering

    const response = await app.request(
      "/api/projects/1/prompts/1/copy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Source prompt not found" });
    expect(getPromptByIdMock).toHaveBeenCalledWith(2, 1, 1); // Called with tenant 2
    expect(copyPromptMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/1/copy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Authentication required" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(copyPromptMock).not.toHaveBeenCalled();
  });

  it("returns 401 when user has no valid tenant", async () => {
    setAuthenticatedUser(-1);

    const response = await app.request(
      "/api/projects/1/prompts/1/copy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(copyPromptMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws error", async () => {
    setAuthenticatedUser(1);
    const sourcePrompt = {
      id: 1,
      name: "Original Prompt",
      slug: "original-prompt",
      projectId: 1,
      tenantId: 1,
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
      createdAt: 1000,
      updatedAt: 1000,
    };

    getPromptByIdMock.mockResolvedValue(sourcePrompt);
    copyPromptMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/prompts/1/copy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Database error" });
  });

  it("returns custom error message when copy fails", async () => {
    setAuthenticatedUser(1);
    const sourcePrompt = {
      id: 1,
      name: "Original Prompt",
      slug: "original-prompt",
      projectId: 1,
      tenantId: 1,
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
      createdAt: 1000,
      updatedAt: 1000,
    };

    getPromptByIdMock.mockResolvedValue(sourcePrompt);
    copyPromptMock.mockRejectedValue(new Error("Source prompt not found"));

    const response = await app.request(
      "/api/projects/1/prompts/1/copy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Source prompt not found" });
  });
});
