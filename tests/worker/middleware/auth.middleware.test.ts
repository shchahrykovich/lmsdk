import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  getAuthenticatedUser,
  hasValidTenant,
  requireAuth,
  } from "../../../worker/middleware/auth.middleware";
import {AuthenticatedUser, getUserFromContext} from "../../../worker/middleware/auth";
import {HonoEnv} from "../../../worker/routes/app";

// Create a mock getSession function
const mockGetSession = vi.fn();

// Mock the createAuth function
vi.mock("../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

describe("Auth Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
  });

  describe("getAuthenticatedUser", () => {
    it("should return user when session exists", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const mockContext = {
        env: { DB: env.DB },
        req: {
          raw: {
            headers: new Headers(),
          },
        },
      } as unknown as Context<HonoEnv>;

      const user = await getAuthenticatedUser(mockContext);

      expect(user).toEqual(mockUser);
      expect(mockGetSession).toHaveBeenCalledWith({
        headers: mockContext.req.raw.headers,
      });
    });

    it("should return null when session does not exist", async () => {
      mockGetSession.mockResolvedValue(null);

      const mockContext = {
        env: { DB: env.DB },
        req: {
          raw: {
            headers: new Headers(),
          },
        },
      } as unknown as Context<HonoEnv>;

      const user = await getAuthenticatedUser(mockContext);

      expect(user).toBeNull();
      expect(mockGetSession).toHaveBeenCalledWith({
        headers: mockContext.req.raw.headers,
      });
    });

    it("should return null when session user is undefined", async () => {
      mockGetSession.mockResolvedValue({
        session: { id: "session-123" },
        user: undefined,
      });

      const mockContext = {
        env: { DB: env.DB },
        req: {
          raw: {
            headers: new Headers(),
          },
        },
      } as unknown as Context<HonoEnv>;

      const user = await getAuthenticatedUser(mockContext);

      expect(user).toBeUndefined();
    });

    it("should pass headers correctly to getSession", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("cookie", "session=abc123");
      mockHeaders.set("authorization", "Bearer token");

      mockGetSession.mockResolvedValue(null);

      const mockContext = {
        env: { DB: {} },
        req: {
          raw: {
            headers: mockHeaders,
          },
        },
      } as unknown as Context<HonoEnv>;

      await getAuthenticatedUser(mockContext);

      expect(mockGetSession).toHaveBeenCalledWith({
        headers: mockHeaders,
      });
    });
  });

  describe("hasValidTenant", () => {
    it("should return true for user with valid tenantId > 0", () => {
      const user = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 1,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(hasValidTenant(user)).toBe(true);
    });

    it("should return true for user with large tenantId", () => {
      const user = {
        id: "user-123",
        tenantId: 999999,
      };

      expect(hasValidTenant(user)).toBe(true);
    });

    it("should return false for user with tenantId = 0", () => {
      const user = {
        id: "user-123",
        tenantId: 0,
      };

      expect(hasValidTenant(user)).toBe(false);
    });

    it("should return false for user with tenantId = -1 (default)", () => {
      const user = {
        id: "user-123",
        tenantId: -1,
      };

      expect(hasValidTenant(user)).toBe(false);
    });

    it("should return false for user with negative tenantId", () => {
      const user = {
        id: "user-123",
        tenantId: -5,
      };

      expect(hasValidTenant(user)).toBe(false);
    });

    it("should return false for user with undefined tenantId", () => {
      const user = {
        id: "user-123",
        tenantId: undefined,
      };

      expect(hasValidTenant(user)).toBe(false);
    });

    it("should return false for user with null tenantId", () => {
      const user = {
        id: "user-123",
        tenantId: null,
      };

      expect(hasValidTenant(user)).toBe(false);
    });

    it("should return false for user with string tenantId", () => {
      const user = {
        id: "user-123",
        tenantId: "1" as any,
      };

      expect(hasValidTenant(user)).toBe(false);
    });

    it("should return false for null user", () => {
      expect(hasValidTenant(null)).toBeFalsy();
    });

    it("should return false for undefined user", () => {
      expect(hasValidTenant(undefined)).toBeFalsy();
    });

    it("should return false for user object without tenantId property", () => {
      const user = {
        id: "user-123",
        name: "Test User",
      };

      expect(hasValidTenant(user)).toBe(false);
    });
  });

  describe("requireAuth middleware", () => {
    let app: Hono<HonoEnv>;

    beforeEach(() => {
      app = new Hono<HonoEnv>();
      // Set up env binding
      app.use("/*", async (c, next) => {
        c.env = { DB: env.DB };
        await next();
      });
      app.use("/*", requireAuth);
      app.get("/test", (c) => c.json({ message: "success" }));
    });

    it("should allow request when user is authenticated", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: "success" });
    });

    it("should return 401 when user is not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Authentication required" });
    });

    it("should not allow user with tenantId = 0", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 0,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(response.status).toBe(401);
    });

    it("should not allow user with tenantId = -1", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: -1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(response.status).toBe(401);
    });

    it("should store user in context for later use", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      let contextUser: AuthenticatedUser | undefined;

      const testApp = new Hono<HonoEnv>();
      testApp.use("/*", async (c, next) => {
        c.env = { DB: env.DB };
        await next();
      });
      testApp.use("/*", requireAuth);
      testApp.get("/test", (c) => {
        contextUser = c.get("user");
        return c.json({ message: "success" });
      });

      await testApp.request("/test", {
        method: "GET",
      });

      expect(contextUser).toEqual(mockUser);
    });
  });

  describe("requireAuth middleware", () => {
    let app: Hono<HonoEnv>;

    beforeEach(() => {
      app = new Hono<HonoEnv>();
      // Set up env binding
      app.use("/*", async (c, next) => {
        c.env = { DB: env.DB };
        await next();
      });
      app.use("/*", requireAuth);
      app.get("/test", (c) => c.json({ message: "success" }));
    });

    it("should allow request when user has valid tenantId > 0", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: "success" });
    });

    it("should return 401 when user is not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Authentication required" });
    });

    it("should return 401 when user has tenantId = 0", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 0,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });

    it("should return 401 when user has tenantId = -1 (default)", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: -1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });

    it("should return 401 when user has negative tenantId", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: -5,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });

    it("should allow user with large tenantId", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 999999,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(response.status).toBe(200);
    });

    it("should store user in context for later use", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      let contextUser: AuthenticatedUser | undefined;

      const testApp = new Hono<HonoEnv>();
      testApp.use("/*", async (c, next) => {
        c.env = { DB: env.DB };
        await next();
      });
      testApp.use("/*", requireAuth);
      testApp.get("/test", (c) => {
        contextUser = c.get("user");
        return c.json({ message: "success" });
      });

      await testApp.request("/test", {
        method: "GET",
      });

      expect(contextUser).toEqual(mockUser);
    });

    it("should protect against multiple tenantId edge cases", async () => {
      const testCases = [
        { tenantId: 0, shouldPass: false, description: "tenantId = 0" },
        { tenantId: -1, shouldPass: false, description: "tenantId = -1 (default)" },
        { tenantId: -100, shouldPass: false, description: "negative tenantId" },
        { tenantId: 1, shouldPass: true, description: "tenantId = 1" },
        { tenantId: 2, shouldPass: true, description: "tenantId = 2" },
        { tenantId: 100, shouldPass: true, description: "tenantId = 100" },
      ];

      for (const testCase of testCases) {
        const mockUser: AuthenticatedUser = {
          id: "user-123",
          name: "Test User",
          email: "test@example.com",
          tenantId: testCase.tenantId,
          emailVerified: true,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockGetSession.mockResolvedValue({
          user: mockUser,
          session: { id: "session-123" },
        });

        const response = await app.request("/test", {
          method: "GET",
        });

        if (testCase.shouldPass) {
          expect(response.status, `${testCase.description} should pass`).toBe(200);
        } else {
          expect(response.status, `${testCase.description} should fail`).toBe(401);
        }
      }
    });
  });

  describe("getUserFromContext", () => {
    it("should return user from context", () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockContext = {
        get: vi.fn().mockReturnValue(mockUser),
      } as unknown as Context<HonoEnv>;

      const user = getUserFromContext(mockContext);

      expect(user).toEqual(mockUser);
      expect(mockContext.get).toHaveBeenCalledWith("user");
    });

    it("should work after requireAuth middleware", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      let retrievedUser: AuthenticatedUser | undefined;

      const app = new Hono<HonoEnv>();
      app.use("/*", async (c, next) => {
        c.env = { DB: env.DB };
        await next();
      });
      app.use("/*", requireAuth);
      app.get("/test", (c) => {
        retrievedUser = getUserFromContext(c);
        return c.json({ message: "success" });
      });

      await app.request("/test", {
        method: "GET",
      });

      expect(retrievedUser).toEqual(mockUser);
    });

    it("should work after requireAuth middleware", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 5,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      let retrievedUser: AuthenticatedUser | undefined;

      const app = new Hono<HonoEnv>();
      app.use("/*", async (c, next) => {
        c.env = { DB: env.DB };
        await next();
      });
      app.use("/*", requireAuth);
      app.get("/test", (c) => {
        retrievedUser = getUserFromContext(c);
        return c.json({ message: "success", tenantId: retrievedUser?.tenantId });
      });

      const response = await app.request("/test", {
        method: "GET",
      });

      expect(retrievedUser).toEqual(mockUser);
      expect(retrievedUser?.tenantId).toBe(5);

      const data = await response.json();
      expect(data.tenantId).toBe(5);
    });
  });

  describe("Integration scenarios", () => {
    it("should handle POST request with authentication", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const app = new Hono<HonoEnv>();
      app.use("/*", async (c, next) => {
        c.env = { DB: env.DB };
        await next();
      });
      app.use("/*", requireAuth);
      app.post("/create", async (c) => {
        const user = getUserFromContext(c);
        return c.json({ userId: user.id, created: true });
      });

      const response = await app.request("/create", {
        method: "POST",
        body: JSON.stringify({ name: "New Item" }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ userId: "user-123", created: true });
    });

    it("should handle multiple middleware checks in sequence", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: 2,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const app = new Hono<HonoEnv>();
      app.use("/*", async (c, next) => {
        c.env = { DB: env.DB };
        await next();
      });
      app.use("/protected/*", requireAuth);
      app.use("/protected/tenant/*", requireAuth);
      app.get("/protected/tenant/resource", (c) => {
        const user = getUserFromContext(c);
        return c.json({ tenantId: user.tenantId, access: "granted" });
      });

      const response = await app.request("/protected/tenant/resource", {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ tenantId: 2, access: "granted" });
    });

    it("should reject unauthenticated request in nested middleware", async () => {
      mockGetSession.mockResolvedValue(null);

      const app = new Hono<HonoEnv>();
      app.use("/*", async (c, next) => {
        c.env = { DB: env.DB };
        await next();
      });
      app.use("/protected/*", requireAuth);
      app.use("/protected/tenant/*", requireAuth);
      app.get("/protected/tenant/resource", (c) => {
        return c.json({ access: "granted" });
      });

      const response = await app.request("/protected/tenant/resource", {
        method: "GET",
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Authentication required" });
    });

    it("should reject invalid tenant in nested middleware", async () => {
      const mockUser: AuthenticatedUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId: -1,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetSession.mockResolvedValue({
        user: mockUser,
        session: { id: "session-123" },
      });

      const app = new Hono<HonoEnv>();
      app.use("/*", async (c, next) => {
        c.env = { DB: env.DB };
        await next();
      });
      app.use("/protected/*", requireAuth);
      app.use("/protected/tenant/*", requireAuth);
      app.get("/protected/tenant/resource", (c) => {
        return c.json({ access: "granted" });
      });

      const response = await app.request("/protected/tenant/resource", {
        method: "GET",
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });
  });
});
