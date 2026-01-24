import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker";

const mockGetSession = vi.fn();
const getPromptByIdMock = vi.fn();
const renamePromptMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/prompts/prompt.service", () => ({
  PromptService: class {
    getPromptById = getPromptByIdMock;
    renamePrompt = renamePromptMock;
  },
}));

describe("PATCH /api/projects/:projectId/prompts/:promptId/rename", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getPromptByIdMock.mockReset();
    renamePromptMock.mockReset();
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

  it("renames a prompt successfully", async () => {
    setAuthenticatedUser(1);
    const existingPrompt = {
      id: 1,
      name: "Original Name",
      slug: "original-slug",
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
    const renamedPrompt = {
      ...existingPrompt,
      name: "New Name",
      slug: "new-slug",
      updatedAt: 2000,
    };

    getPromptByIdMock.mockResolvedValue(existingPrompt);
    renamePromptMock.mockResolvedValue(renamedPrompt);

    const response = await app.request(
      "/api/projects/1/prompts/1/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name", slug: "new-slug" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.prompt).toEqual(renamedPrompt);
    expect(getPromptByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, projectId: 1, tenantId: 1 })
    );
    expect(renamePromptMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, projectId: 1, tenantId: 1 }),
      "New Name"
    );
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/prompts/1/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name", slug: "new-slug" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project ID" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(renamePromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid prompt ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/invalid/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name", slug: "new-slug" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid prompt ID" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(renamePromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/1/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "new-slug" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Name is required" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(renamePromptMock).not.toHaveBeenCalled();
  });

  it("returns 400 when both name and slug are missing", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/1/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Name is required" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(renamePromptMock).not.toHaveBeenCalled();
  });

  it("trims whitespace from name and slug", async () => {
    setAuthenticatedUser(1);
    const existingPrompt = {
      id: 1,
      name: "Original Name",
      slug: "original-slug",
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

    getPromptByIdMock.mockResolvedValue(existingPrompt);
    renamePromptMock.mockResolvedValue({ ...existingPrompt, name: "New Name", slug: "new-slug" });

    const response = await app.request(
      "/api/projects/1/prompts/1/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "  New Name  ", slug: "  new-slug  " }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(renamePromptMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, projectId: 1, tenantId: 1 }),
      "New Name"
    );
  });

  it("returns 404 when prompt not found", async () => {
    setAuthenticatedUser(1);
    getPromptByIdMock.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/999/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name", slug: "new-slug" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt not found" });
    expect(getPromptByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 999, projectId: 1, tenantId: 1 })
    );
    expect(renamePromptMock).not.toHaveBeenCalled();
  });

  it("enforces cross-tenant protection - cannot rename prompt from different tenant", async () => {
    setAuthenticatedUser(2);
    // Prompt belongs to tenant 1, but user is tenant 2
    getPromptByIdMock.mockResolvedValue(null); // Won't find it due to tenant filtering

    const response = await app.request(
      "/api/projects/1/prompts/1/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name", slug: "new-slug" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt not found" });
    expect(getPromptByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, projectId: 1, tenantId: 2 })
    ); // Called with tenant 2
    expect(renamePromptMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/1/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name", slug: "new-slug" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Authentication required" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(renamePromptMock).not.toHaveBeenCalled();
  });

  it("returns 401 when user has no valid tenant", async () => {
    setAuthenticatedUser(-1);

    const response = await app.request(
      "/api/projects/1/prompts/1/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name", slug: "new-slug" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    expect(getPromptByIdMock).not.toHaveBeenCalled();
    expect(renamePromptMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws error", async () => {
    setAuthenticatedUser(1);
    const existingPrompt = {
      id: 1,
      name: "Original Name",
      slug: "original-slug",
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

    getPromptByIdMock.mockResolvedValue(existingPrompt);
    renamePromptMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/prompts/1/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name", slug: "new-slug" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Database error" });
  });

  it("returns custom error message when rename fails due to slug conflict", async () => {
    setAuthenticatedUser(1);
    const existingPrompt = {
      id: 1,
      name: "Original Name",
      slug: "original-slug",
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

    getPromptByIdMock.mockResolvedValue(existingPrompt);
    renamePromptMock.mockRejectedValue(new Error("Slug already in use"));

    const response = await app.request(
      "/api/projects/1/prompts/1/rename",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name", slug: "existing-slug" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Slug already in use" });
  });
});
