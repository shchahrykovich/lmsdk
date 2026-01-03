import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const listPromptVersionsMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/prompt.service", () => ({
  PromptService: class {
    listPromptVersions = listPromptVersionsMock;
  },
}));

describe("GET /api/projects/:projectId/prompts/:promptId/versions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    listPromptVersionsMock.mockReset();
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

  it("returns list of prompt versions", async () => {
    setAuthenticatedUser(1);
    listPromptVersionsMock.mockResolvedValue([
      {
        id: 1,
        promptId: 1,
        version: 1,
        body: '{"messages": []}',
        createdAt: 1000,
      },
      {
        id: 2,
        promptId: 1,
        version: 2,
        body: '{"messages": [{"role": "user", "content": "test"}]}',
        createdAt: 2000,
      },
    ]);

    const response = await app.request(
      "/api/projects/1/prompts/1/versions",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.versions).toHaveLength(2);
    expect(data.versions[0].version).toBe(1);
    expect(data.versions[1].version).toBe(2);
    expect(listPromptVersionsMock).toHaveBeenCalledWith(1, 1, 1);
  });

  it("returns empty array when no versions exist", async () => {
    setAuthenticatedUser(1);
    listPromptVersionsMock.mockResolvedValue([]);

    const response = await app.request(
      "/api/projects/1/prompts/5/versions",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.versions).toEqual([]);
    expect(listPromptVersionsMock).toHaveBeenCalledWith(1, 1, 5);
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/prompts/1/versions",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(listPromptVersionsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid prompt ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/invalid/versions",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(listPromptVersionsMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/1/versions",
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
      "/api/projects/1/prompts/1/versions",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
  });

  it("returns 500 when service throws error", async () => {
    setAuthenticatedUser(1);
    listPromptVersionsMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/prompts/1/versions",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Failed to list prompt versions" });
  });

  it("prevents cross-tenant access", async () => {
    setAuthenticatedUser(1);
    listPromptVersionsMock.mockResolvedValue([]);

    const response = await app.request(
      "/api/projects/2/prompts/5/versions",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(listPromptVersionsMock).toHaveBeenCalledWith(1, 2, 5);
  });
});
