import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe.skip("Worker Integration Tests", () => {
  describe("Frontend routes", () => {
    it("should serve frontend for root path", async () => {
      const response = await SELF.fetch("http://example.com/");

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Frontend route");
    });

    it("should serve frontend for nested paths", async () => {
      const paths = [
        "/about",
        "/signin",
        "/signup",
        "/dashboard/settings",
      ];

      for (const path of paths) {
        const response = await SELF.fetch(`http://example.com${path}`);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("Frontend route");
      }
    });

    it("should handle paths with query parameters", async () => {
      const response = await SELF.fetch("http://example.com/page?param=value");

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Frontend route");
    });
  });

  describe("Auth routes", () => {
    it("should handle /api/auth endpoints (requires Prisma/D1 setup)", async () => {
      // Note: Auth routes depend on Prisma WASM module which has loading issues in test environment
      // This test is skipped until we set up proper test database mocking
      const response = await SELF.fetch("http://example.com/api/auth/session");

      // Auth routes should at least respond (not 404)
      expect(response.status).not.toBe(404);
    });

    it("should handle POST to /api/auth endpoints (requires Prisma/D1 setup)", async () => {
      // Note: Auth routes depend on Prisma WASM module which has loading issues in test environment
      // This test is skipped until we set up proper test database mocking
      const response = await SELF.fetch("http://example.com/api/auth/sign-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
        }),
      });

      // Auth endpoint should respond (not 404)
      expect(response.status).not.toBe(404);
    });
  });

  describe("HTTP methods", () => {
    it("should handle different HTTP methods on API routes", async () => {
      const methods = ["GET", "POST", "PUT", "DELETE"];

      for (const method of methods) {
        const response = await SELF.fetch("http://example.com/api/test", {
          method,
        });

        // Should not return 405 Method Not Allowed for /api/test with GET
        if (method === "GET") {
          expect(response.status).toBe(200);
        }
      }
    });
  });
});
