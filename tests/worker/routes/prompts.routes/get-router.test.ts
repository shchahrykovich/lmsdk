import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getActiveRouterVersionMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/prompt.service", () => ({
  PromptService: class {
    getActiveRouterVersion = getActiveRouterVersionMock;
  },
}));

describe("GET /api/projects/:projectId/prompts/:promptId/router", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getActiveRouterVersionMock.mockReset();
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

  it("returns the active router version", async () => {
    setAuthenticatedUser(1);
    getActiveRouterVersionMock.mockResolvedValue(2);

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.routerVersion).toBe(2);
    expect(getActiveRouterVersionMock).toHaveBeenCalledWith(1, 1, 1);
  });

  it("returns null when no router version is set", async () => {
    setAuthenticatedUser(1);
    getActiveRouterVersionMock.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.routerVersion).toBeNull();
    expect(getActiveRouterVersionMock).toHaveBeenCalledWith(1, 1, 1);
  });

  it("returns 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/prompts/1/router",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(getActiveRouterVersionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid prompt ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/prompts/invalid/router",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid project or prompt ID" });
    expect(getActiveRouterVersionMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is present", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
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
      "/api/projects/1/prompts/1/router",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
  });

  it("returns 500 when service throws error", async () => {
    setAuthenticatedUser(1);
    getActiveRouterVersionMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/prompts/1/router",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Failed to get router version" });
  });

  it("prevents cross-tenant access", async () => {
    setAuthenticatedUser(1);
    getActiveRouterVersionMock.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/2/prompts/5/router",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(getActiveRouterVersionMock).toHaveBeenCalledWith(1, 2, 5);
  });
});
