import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const listPromptsMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/prompt.service", () => ({
  PromptService: class {
    listPrompts = listPromptsMock;
  },
}));

describe("GET /api/projects/:projectId/prompts", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    listPromptsMock.mockReset();
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

  it("returns list of prompts for a project", async () => {
    setAuthenticatedUser(1);
    listPromptsMock.mockResolvedValue([
      {
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
      },
      {
        id: 2,
        name: "Prompt B",
        slug: "prompt-b",
        projectId: 1,
        tenantId: 1,
        provider: "anthropic",
        model: "claude-3",
        latestVersion: 2,
        isActive: true,
        createdAt: 1100,
        updatedAt: 1100,
      },
    ]);

    const response = await app.request(
      "/api/projects/1/prompts",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.prompts).toHaveLength(2);
    expect(data.prompts[0].name).toBe("Prompt A");
    expect(data.prompts[1].name).toBe("Prompt B");
    expect(listPromptsMock).toHaveBeenCalledWith(1, 1);
  });

  it("returns empty array when no prompts exist", async () => {
    setAuthenticatedUser(1);
    listPromptsMock.mockResolvedValue([]);

    const response = await app.request(
      "/api/projects/5/prompts",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.prompts).toEqual([]);
    expect(listPromptsMock).toHaveBeenCalledWith(1, 5);
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/prompts",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project ID" });
    expect(listPromptsMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts",
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
      "/api/projects/1/prompts",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
  });

  it("returns 500 when service throws error", async () => {
    setAuthenticatedUser(1);
    listPromptsMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/prompts",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Failed to list prompts" });
  });

  it("prevents cross-tenant access", async () => {
    setAuthenticatedUser(1);
    listPromptsMock.mockResolvedValue([]);

    const response = await app.request(
      "/api/projects/2/prompts",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(listPromptsMock).toHaveBeenCalledWith(1, 2);
  });
});
