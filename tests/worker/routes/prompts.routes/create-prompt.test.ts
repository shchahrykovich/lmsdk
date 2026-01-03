import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const createPromptMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/prompt.service", () => ({
  PromptService: class {
    createPrompt = createPromptMock;
  },
}));

describe("POST /api/projects/:projectId/prompts", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    createPromptMock.mockReset();
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

  it("creates a new prompt with valid data", async () => {
    setAuthenticatedUser(1);
    const newPrompt = {
      id: 1,
      name: "New Prompt",
      slug: "new-prompt",
      projectId: 1,
      tenantId: 1,
      provider: "openai",
      model: "gpt-4",
      latestVersion: 1,
      isActive: true,
      createdAt: 1000,
      updatedAt: 1000,
    };
    createPromptMock.mockResolvedValue(newPrompt);

    const response = await app.request(
      "/api/projects/1/prompts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Prompt",
          slug: "new-prompt",
          provider: "openai",
          model: "gpt-4",
          body: '{"messages": []}',
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.prompt).toEqual(newPrompt);
    expect(createPromptMock).toHaveBeenCalledWith({
      tenantId: 1,
      projectId: 1,
      name: "New Prompt",
      slug: "new-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"messages": []}',
    });
  });

  it("creates prompt with default empty body when body is not provided", async () => {
    setAuthenticatedUser(1);
    const newPrompt = {
      id: 2,
      name: "Prompt No Body",
      slug: "prompt-no-body",
      projectId: 2,
      tenantId: 1,
      provider: "anthropic",
      model: "claude-3",
      latestVersion: 1,
      isActive: true,
      createdAt: 2000,
      updatedAt: 2000,
    };
    createPromptMock.mockResolvedValue(newPrompt);

    const response = await app.request(
      "/api/projects/2/prompts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Prompt No Body",
          slug: "prompt-no-body",
          provider: "anthropic",
          model: "claude-3",
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(201);
    expect(createPromptMock).toHaveBeenCalledWith({
      tenantId: 1,
      projectId: 2,
      name: "Prompt No Body",
      slug: "prompt-no-body",
      provider: "anthropic",
      model: "claude-3",
      body: "{}",
    });
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/prompts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Prompt",
          slug: "new-prompt",
          provider: "openai",
          model: "gpt-4",
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project ID" });
    expect(createPromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "new-prompt",
          provider: "openai",
          model: "gpt-4",
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Name, slug, provider, and model are required" });
    expect(createPromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 when slug is missing", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Prompt",
          provider: "openai",
          model: "gpt-4",
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Name, slug, provider, and model are required" });
    expect(createPromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 when provider is missing", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Prompt",
          slug: "new-prompt",
          model: "gpt-4",
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Name, slug, provider, and model are required" });
    expect(createPromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 when model is missing", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Prompt",
          slug: "new-prompt",
          provider: "openai",
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Name, slug, provider, and model are required" });
    expect(createPromptMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Prompt",
          slug: "new-prompt",
          provider: "openai",
          model: "gpt-4",
        }),
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
      "/api/projects/1/prompts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Prompt",
          slug: "new-prompt",
          provider: "openai",
          model: "gpt-4",
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
  });

  it("returns 500 when service throws error", async () => {
    setAuthenticatedUser(1);
    createPromptMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/prompts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Prompt",
          slug: "new-prompt",
          provider: "openai",
          model: "gpt-4",
        }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Failed to create prompt" });
  });
});
