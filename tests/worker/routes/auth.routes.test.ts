import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import app from "../../../worker/index";
import { applyMigrations } from "../helpers/db-setup";

// Mock TenantService
const mockGetCountOfTenants = vi.fn();
const mockCreateTenant = vi.fn();
const mockRemoveTenant = vi.fn();
vi.mock("../../../worker/services/tenant.service", () => ({
  TenantService: class {
    constructor() {}
    getCountOfTenants = mockGetCountOfTenants;
    createTenant = mockCreateTenant;
    removeTenant = mockRemoveTenant;
  },
}));

describe("Auth Routes", () => {
  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Reset mocks
    vi.clearAllMocks();
    mockGetCountOfTenants.mockReset();
    mockCreateTenant.mockReset();
    mockRemoveTenant.mockReset();

    // Setup default mock return values
    mockCreateTenant.mockResolvedValue({ id: 1, isActive: true });
  });

  describe("POST /api/auth/sign-up - tenant creation restriction", () => {
    it("should allow sign-up when ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT is true", async () => {
      // Setup: tenant already exists
      mockGetCountOfTenants.mockResolvedValue(1);

      const response = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "test@example.com",
            password: "password123",
            name: "Test User",
          }),
        },
        {
          DB: env.DB,
          ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT: "true",
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should not check tenant count when env var is true (neither in route nor hook)
      expect(mockGetCountOfTenants).not.toHaveBeenCalled();

      // Should call createTenant in the hook (without checking count first)
      expect(mockCreateTenant).toHaveBeenCalledTimes(1);

      // Request should pass through to better-auth
      // Note: actual response depends on better-auth implementation
      expect(response.status).not.toBe(400);
    });

    it("should allow sign-up for first tenant (count = 0)", async () => {
      // Setup: no tenants exist
      mockGetCountOfTenants.mockResolvedValue(0);

      const response = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "first@example.com",
            password: "password123",
            name: "First User",
          }),
        },
        {
          DB: env.DB,
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should check tenant count twice: once in route, once in auth hook
      expect(mockGetCountOfTenants).toHaveBeenCalledTimes(2);

      // Should call createTenant once in the hook
      expect(mockCreateTenant).toHaveBeenCalledTimes(1);

      // Should allow sign-up when no tenants exist
      expect(response.status).not.toBe(400);
    });

    it("should block sign-up when tenant already exists and env var is not true", async () => {
      // Setup: tenant already exists
      mockGetCountOfTenants.mockResolvedValue(1);

      const response = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "blocked@example.com",
            password: "password123",
            name: "Blocked User",
          }),
        },
        {
          DB: env.DB,
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should check tenant count
      expect(mockGetCountOfTenants).toHaveBeenCalledTimes(1);

      // Should block with 400
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "can_not_create_tenant" });
    });

    it("should block sign-up when multiple tenants exist", async () => {
      // Setup: multiple tenants exist
      mockGetCountOfTenants.mockResolvedValue(3);

      const response = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "blocked2@example.com",
            password: "password123",
            name: "Blocked User 2",
          }),
        },
        {
          DB: env.DB,
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should check tenant count
      expect(mockGetCountOfTenants).toHaveBeenCalledTimes(1);

      // Should block with 400
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "can_not_create_tenant" });
    });

    it("should handle case-insensitive sign-up path", async () => {
      // Setup: tenant already exists
      mockGetCountOfTenants.mockResolvedValue(1);

      const paths = [
        "/api/auth/sign-up/email",
        "/api/auth/Sign-Up/email",
        "/api/auth/SIGN-UP/email",
        "/api/auth/SiGn-Up/email",
      ];

      for (const path of paths) {
        // Reset mock call count for each iteration
        mockGetCountOfTenants.mockClear();

        const response = await app.request(
          path,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: "test@example.com",
              password: "password123",
              name: "Test User",
            }),
          },
          {
            DB: env.DB,
            BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
          }
        );

        // Should check tenant count for all case variations
        expect(mockGetCountOfTenants).toHaveBeenCalledTimes(1);

        // Should block with 400
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data).toEqual({ error: "can_not_create_tenant" });
      }
    });

    it("should allow sign-up when env var is 'false' string and no tenants exist", async () => {
      // Setup: no tenants exist
      mockGetCountOfTenants.mockResolvedValue(0);

      const response = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "test@example.com",
            password: "password123",
            name: "Test User",
          }),
        },
        {
          DB: env.DB,
          ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT: "false",
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should check tenant count twice: once in route, once in auth hook
      expect(mockGetCountOfTenants).toHaveBeenCalledTimes(2);

      // Should call createTenant once in the hook
      expect(mockCreateTenant).toHaveBeenCalledTimes(1);

      // Should allow when no tenants exist
      expect(response.status).not.toBe(400);
    });

    it("should allow sign-up when env var is undefined and no tenants exist", async () => {
      // Setup: no tenants exist
      mockGetCountOfTenants.mockResolvedValue(0);

      const response = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "test@example.com",
            password: "password123",
            name: "Test User",
          }),
        },
        {
          DB: env.DB,
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should check tenant count twice: once in route, once in auth hook
      expect(mockGetCountOfTenants).toHaveBeenCalledTimes(2);

      // Should call createTenant once in the hook
      expect(mockCreateTenant).toHaveBeenCalledTimes(1);

      // Should allow when no tenants exist
      expect(response.status).not.toBe(400);
    });
  });

  describe("Other auth endpoints - pass through", () => {
    it("should pass through GET /api/auth/session", async () => {
      const response = await app.request(
        "/api/auth/session",
        {
          method: "GET",
        },
        {
          DB: env.DB,
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should not check tenant count for non-signup requests
      expect(mockGetCountOfTenants).not.toHaveBeenCalled();

      // Request should pass through to better-auth
      expect(response.status).not.toBe(400);
    });

    it("should pass through POST /api/auth/sign-out", async () => {
      const response = await app.request(
        "/api/auth/sign-out",
        {
          method: "POST",
        },
        {
          DB: env.DB,
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should not check tenant count for sign-out
      expect(mockGetCountOfTenants).not.toHaveBeenCalled();

      // Request should pass through to better-auth
      expect(response.status).not.toBe(400);
    });

    it("should pass through GET /api/auth/api-key/list", async () => {
      const response = await app.request(
        "/api/auth/api-key/list",
        {
          method: "GET",
        },
        {
          DB: env.DB,
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should not check tenant count for API key endpoints
      expect(mockGetCountOfTenants).not.toHaveBeenCalled();

      // Request should pass through to better-auth
      expect(response.status).not.toBe(400);
    });
  });

  describe("Edge cases", () => {
    it("should handle TenantService throwing error", async () => {
      // Setup: TenantService throws error
      mockGetCountOfTenants.mockRejectedValue(new Error("Database error"));

      const response = await app.request(
        "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "test@example.com",
            password: "password123",
            name: "Test User",
          }),
        },
        {
          DB: env.DB,
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should have attempted to check tenant count
      expect(mockGetCountOfTenants).toHaveBeenCalledTimes(1);

      // Should handle error gracefully (likely 500 or error response)
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should only check paths that start with /api/auth/sign-up", async () => {
      // This path contains "sign-up" but doesn't start with it
      const response = await app.request(
        "/api/auth/verify-sign-up",
        {
          method: "POST",
        },
        {
          DB: env.DB,
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should not check tenant count - path doesn't start with /api/auth/sign-up
      expect(mockGetCountOfTenants).not.toHaveBeenCalled();
    });

    it("should handle sign-up with query parameters", async () => {
      // Setup: tenant already exists
      mockGetCountOfTenants.mockResolvedValue(1);

      const response = await app.request(
        "/api/auth/sign-up/email?redirect=/dashboard",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "test@example.com",
            password: "password123",
            name: "Test User",
          }),
        },
        {
          DB: env.DB,
          BETTER_AUTH_SECRET: "test-secret-key-at-least-32-chars-long",
        }
      );

      // Should still check tenant count
      expect(mockGetCountOfTenants).toHaveBeenCalledTimes(1);

      // Should block with 400
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "can_not_create_tenant" });
    });
  });
});
