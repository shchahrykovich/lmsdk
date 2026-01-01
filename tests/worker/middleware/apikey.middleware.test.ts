import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { requireApiKey } from "../../../worker/middleware/apikey.middleware";
import type { HonoEnv } from "../../../worker";
import { getUserFromContext } from "../../../worker/middleware/auth";
import { applyMigrations } from "../helpers/db-setup";
import { user, apikey } from "../../../worker/db/schema";
import { createAuth } from "../../../auth";
import { randomBytes } from "node:crypto";

describe("API Key Middleware", () => {
  let testUser: { id: string; email: string; name: string; tenantId: number };
  let testApiKey: string;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Create a test user directly in the database
    const db = drizzle(env.DB);
    const userId = `user_${randomBytes(8).toString("hex")}`;
    const userEmail = `test_${randomBytes(4).toString("hex")}@example.com`;

    await db.insert(user).values({
      id: userId,
      email: userEmail,
      name: "Test User",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: 1,
    });

    testUser = {
      id: userId,
      email: userEmail,
      name: "Test User",
      tenantId: 1,
    };

    // Create an API key via better-auth's API
    const auth = createAuth(env);
    const createKeyResponse = await auth.api.createApiKey({
      body: {
        userId: userId,
        name: "Test API Key",
      },
    });

    // Store the raw API key for use in tests
    testApiKey = createKeyResponse.key;
  });

  describe("requireApiKey middleware", () => {
    let app: Hono<HonoEnv>;

    beforeEach(() => {
      app = new Hono<HonoEnv>();
      // Set up the same middleware chain as the real app
      app.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      app.use("/*", requireApiKey);
      app.get("/test", (c) => c.json({ message: "success" }));
    });

    it("should return 401 when no API key is provided", async () => {
      const response = await app.request("/test", {}, { DB: env.DB });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "API key required" });
    });

    it("should return 401 when API key header is empty", async () => {
      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": "",
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "API key required" });
    });

    it("should return 401 when whitespace-only API key is provided", async () => {
      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": "   ",
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "API key required" });
    });

    it("should return 401 when invalid API key is provided", async () => {
      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": "invalid_api_key_12345",
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid API key" });
    });

    it("should allow request when valid API key is provided", async () => {
      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": testApiKey,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: "success" });
    });

    it("should return 401 when API key is disabled", async () => {
      // Get the API key from the database
      const db = drizzle(env.DB);
      const [apiKeyRecord] = await db
        .select()
        .from(apikey)
        .where(eq(apikey.userId, testUser.id))
        .limit(1);

      // Disable the API key
      await db
        .update(apikey)
        .set({ enabled: false })
        .where(eq(apikey.id, apiKeyRecord.id));

      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": testApiKey,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid API key" });
    });

    it("should handle API key with uppercase header name", async () => {
      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "X-API-KEY": testApiKey, // Uppercase
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: "success" });
    });

    it("should return 404 when user associated with API key does not exist", async () => {
      // Delete the user but leave the API key
      const db = drizzle(env.DB);
      await db.delete(user).where(eq(user.id, testUser.id));

      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": testApiKey,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "User not found" });
    });

    it("should store user in context for later use", async () => {
      let contextUser: any;

      const testApp = new Hono<HonoEnv>();
      testApp.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      testApp.use("/*", requireApiKey);
      testApp.get("/test", (c) => {
        contextUser = c.get("user");
        return c.json({ message: "success" });
      });

      const response = await testApp.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": testApiKey,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      expect(contextUser).toBeDefined();
      expect(contextUser.id).toBe(testUser.id);
      expect(contextUser.email).toBe(testUser.email);
      expect(contextUser.name).toBe(testUser.name);
      expect(contextUser.tenantId).toBe(testUser.tenantId);
    });

    it("should work with getUserFromContext helper", async () => {
      let retrievedUser: any;

      const testApp = new Hono<HonoEnv>();
      testApp.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      testApp.use("/*", requireApiKey);
      testApp.get("/test", (c) => {
        retrievedUser = getUserFromContext(c);
        return c.json({
          message: "success",
          userId: retrievedUser.id,
          tenantId: retrievedUser.tenantId,
        });
      });

      const response = await testApp.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": testApiKey,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.userId).toBe(testUser.id);
      expect(data.tenantId).toBe(testUser.tenantId);
      expect(retrievedUser.email).toBe(testUser.email);
    });

    it("should handle POST requests with API key authentication", async () => {
      const testApp = new Hono<HonoEnv>();
      testApp.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      testApp.use("/*", requireApiKey);
      testApp.post("/create", async (c) => {
        const user = getUserFromContext(c);
        const body = await c.req.json();
        return c.json({
          userId: user.id,
          created: true,
          itemName: body.name,
        });
      });

      const response = await testApp.request(
        "/create",
        {
          method: "POST",
          headers: new Headers({
            "x-api-key": testApiKey,
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ name: "New Item" }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        userId: testUser.id,
        created: true,
        itemName: "New Item",
      });
    });

    it("should allow users with tenantId = 0 (middleware only checks authentication)", async () => {
      // Create a user with tenantId = 0
      const db = drizzle(env.DB);
      const userId = `user_${randomBytes(8).toString("hex")}`;

      await db.insert(user).values({
        id: userId,
        email: `notenant_${randomBytes(4).toString("hex")}@example.com`,
        name: "No Tenant User",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: 0,
      });

      // Create API key for this user
      const auth = createAuth(env);
      const keyResult = await auth.api.createApiKey({
        body: {
          userId: userId,
          name: "No Tenant Key",
        },
      });

      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": keyResult.key,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ message: "success" });
    });

    it("should allow users with tenantId = -1 (default)", async () => {
      // Create a user with tenantId = -1
      const db = drizzle(env.DB);
      const userId = `user_${randomBytes(8).toString("hex")}`;

      await db.insert(user).values({
        id: userId,
        email: `default_${randomBytes(4).toString("hex")}@example.com`,
        name: "Default Tenant User",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: -1,
      });

      // Create API key for this user
      const auth = createAuth(env);
      const keyResult = await auth.api.createApiKey({
        body: {
          userId: userId,
          name: "Default Tenant Key",
        },
      });

      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": keyResult.key,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
    });

    it("should fetch full user details from database", async () => {
      // Create a user with all fields
      const db = drizzle(env.DB);
      const userId = `user_${randomBytes(8).toString("hex")}`;
      const now = new Date();

      await db.insert(user).values({
        id: userId,
        email: `full_${randomBytes(4).toString("hex")}@example.com`,
        name: "Full Details User",
        emailVerified: true,
        image: "https://example.com/avatar.png",
        createdAt: now,
        updatedAt: now,
        tenantId: 5,
      });

      // Create API key
      const auth = createAuth(env);
      const keyResult = await auth.api.createApiKey({
        body: {
          userId: userId,
          name: "Full Details Key",
        },
      });

      let retrievedUser: any;

      const testApp = new Hono<HonoEnv>();
      testApp.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      testApp.use("/*", requireApiKey);
      testApp.get("/test", (c) => {
        retrievedUser = getUserFromContext(c);
        return c.json({ message: "success" });
      });

      const response = await testApp.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": keyResult.key,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser.id).toBe(userId);
      expect(retrievedUser.name).toBe("Full Details User");
      expect(retrievedUser.email).toContain("full_");
      expect(retrievedUser.tenantId).toBe(5);
      expect(retrievedUser.emailVerified).toBe(true);
      expect(retrievedUser.image).toBe("https://example.com/avatar.png");
      expect(retrievedUser.createdAt).toBeInstanceOf(Date);
      expect(retrievedUser.updatedAt).toBeInstanceOf(Date);
    });

    it("should handle concurrent requests with the same API key", async () => {
      // Make multiple concurrent requests
      const requests = Array.from({ length: 5 }, () =>
        app.request(
          "/test",
          {
            headers: new Headers({
              "x-api-key": testApiKey,
            }),
          },
          { DB: env.DB }
        )
      );

      const responses = await Promise.all(requests);

      // All should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ message: "success" });
      }
    });
  });

  describe("Cross-tenant API key scenarios", () => {
    it("should correctly identify tenant from API key authenticated user", async () => {
      // Create users in different tenants
      const db = drizzle(env.DB);
      const userId1 = `user_${randomBytes(8).toString("hex")}`;
      const userId2 = `user_${randomBytes(8).toString("hex")}`;

      await db.insert(user).values({
        id: userId1,
        email: `tenant1_${randomBytes(4).toString("hex")}@example.com`,
        name: "Tenant 1 User",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: 1,
      });

      await db.insert(user).values({
        id: userId2,
        email: `tenant2_${randomBytes(4).toString("hex")}@example.com`,
        name: "Tenant 2 User",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: 2,
      });

      // Create API keys for both users
      const auth = createAuth(env);
      const key1Result = await auth.api.createApiKey({
        body: { userId: userId1, name: "Tenant 1 Key" },
      });
      const key2Result = await auth.api.createApiKey({
        body: { userId: userId2, name: "Tenant 2 Key" },
      });

      const app = new Hono<HonoEnv>();
      app.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      app.use("/*", requireApiKey);
      app.get("/resource", (c) => {
        const user = getUserFromContext(c);
        return c.json({
          tenantId: user.tenantId,
          userId: user.id,
        });
      });

      // Test with tenant 1 API key
      let response = await app.request(
        "/resource",
        {
          headers: new Headers({ "x-api-key": key1Result.key }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      let data = await response.json();
      expect(data.tenantId).toBe(1);
      expect(data.userId).toBe(userId1);

      // Test with tenant 2 API key
      response = await app.request(
        "/resource",
        {
          headers: new Headers({ "x-api-key": key2Result.key }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      data = await response.json();
      expect(data.tenantId).toBe(2);
      expect(data.userId).toBe(userId2);
    });

    it("should handle multiple API keys for the same user", async () => {
      // Create additional API keys for the same user
      const auth = createAuth(env);
      const key2Result = await auth.api.createApiKey({
        body: { userId: testUser.id, name: "API Key 2" },
      });
      const key3Result = await auth.api.createApiKey({
        body: { userId: testUser.id, name: "API Key 3" },
      });

      const app = new Hono<HonoEnv>();
      app.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      app.use("/*", requireApiKey);
      app.get("/test", (c) => c.json({ message: "success" }));

      // Test all three API keys
      const keys = [testApiKey, key2Result.key, key3Result.key];

      for (const key of keys) {
        const response = await app.request(
          "/test",
          {
            headers: new Headers({ "x-api-key": key }),
          },
          { DB: env.DB }
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ message: "success" });
      }
    });
  });

  describe("Integration with tenant validation", () => {
    it("should work alongside tenant validation logic", async () => {
      const testApp = new Hono<HonoEnv>();
      testApp.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      testApp.use("/*", requireApiKey);
      testApp.get("/tenant-resource", (c) => {
        const user = getUserFromContext(c);

        // Route-level tenant validation (as would be done in real routes)
        if (user.tenantId <= 0) {
          return c.json({ error: "Invalid tenant" }, 403);
        }

        return c.json({
          access: "granted",
          tenantId: user.tenantId,
        });
      });

      const response = await testApp.request(
        "/tenant-resource",
        {
          headers: new Headers({ "x-api-key": testApiKey }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.access).toBe("granted");
      expect(data.tenantId).toBe(1);
    });

    it("should allow route-level tenant validation to reject users with invalid tenants", async () => {
      // Create a user with invalid tenant (0)
      const db = drizzle(env.DB);
      const userId = `user_${randomBytes(8).toString("hex")}`;

      await db.insert(user).values({
        id: userId,
        email: `invalid_${randomBytes(4).toString("hex")}@example.com`,
        name: "Invalid Tenant User",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: 0,
      });

      // Create API key for this user
      const auth = createAuth(env);
      const keyResult = await auth.api.createApiKey({
        body: { userId: userId, name: "Invalid Tenant Key" },
      });

      const testApp = new Hono<HonoEnv>();
      testApp.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      testApp.use("/*", requireApiKey);
      testApp.get("/tenant-resource", (c) => {
        const user = getUserFromContext(c);

        // Route-level tenant validation
        if (user.tenantId <= 0) {
          return c.json({ error: "Invalid tenant" }, 403);
        }

        return c.json({ access: "granted" });
      });

      const response = await testApp.request(
        "/tenant-resource",
        {
          headers: new Headers({ "x-api-key": keyResult.key }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("Invalid tenant");
    });
  });

  describe("Error handling", () => {
    it("should handle malformed API keys gracefully", async () => {
      const app = new Hono<HonoEnv>();
      app.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      app.use("/*", requireApiKey);
      app.get("/test", (c) => c.json({ message: "success" }));

      const malformedKeys = [
        "not-a-valid-key",
        "12345",
        "abcdef",
        "sk_",
        "sk_test_",
        `sk_test_${randomBytes(4).toString("hex")}`, // Too short
      ];

      for (const key of malformedKeys) {
        const response = await app.request(
          "/test",
          {
            headers: new Headers({
              "x-api-key": key,
            }),
          },
          { DB: env.DB }
        );

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data).toEqual({ error: "Invalid API key" });
      }
    });

    it("should handle special characters in API key", async () => {
      const app = new Hono<HonoEnv>();
      app.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      app.use("/*", requireApiKey);
      app.get("/test", (c) => c.json({ message: "success" }));

      const specialKeys = [
        "sk_test_!@#$%^&*()",
        "sk_test_<script>alert('xss')</script>",
        "sk_test_; DROP TABLE users; --",
      ];

      for (const key of specialKeys) {
        const response = await app.request(
          "/test",
          {
            headers: new Headers({
              "x-api-key": key,
            }),
          },
          { DB: env.DB }
        );

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data).toEqual({ error: "Invalid API key" });
      }
    });

    it("should handle very long API keys", async () => {
      const app = new Hono<HonoEnv>();
      app.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      app.use("/*", requireApiKey);
      app.get("/test", (c) => c.json({ message: "success" }));

      const veryLongKey = `sk_test_${randomBytes(1000).toString("hex")}`;

      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": veryLongKey,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid API key" });
    });

    it("should verify database state after successful authentication", async () => {
      const app = new Hono<HonoEnv>();
      app.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
      });
      app.use("/*", requireApiKey);
      app.get("/test", (c) => c.json({ message: "success" }));

      const response = await app.request(
        "/test",
        {
          headers: new Headers({
            "x-api-key": testApiKey,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);

      // Verify API key is still enabled in database
      const db = drizzle(env.DB);
      const [apiKeyRecord] = await db
        .select()
        .from(apikey)
        .where(eq(apikey.userId, testUser.id))
        .limit(1);

      expect(apiKeyRecord).toBeDefined();
      expect(apiKeyRecord.enabled).toBe(true);
      expect(apiKeyRecord.userId).toBe(testUser.id);

      // Verify user still exists and unchanged
      const [userRecord] = await db
        .select()
        .from(user)
        .where(eq(user.id, testUser.id))
        .limit(1);

      expect(userRecord).toBeDefined();
      expect(userRecord.email).toBe(testUser.email);
      expect(userRecord.name).toBe(testUser.name);
    });
  });
});
