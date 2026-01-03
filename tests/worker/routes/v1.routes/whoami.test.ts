import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import app from "../../../../worker/index";
import { createAuth } from "../../../../auth";
import { randomBytes } from "node:crypto";
import { user, apikey } from "../../../../worker/db/schema";
import { requestWithApiKey, setupApiKeyUser } from "./helpers";

describe("V1 Whoami Routes", () => {
  let testUser: { id: string; email: string; name: string };
  let testApiKey: string;

  beforeEach(async () => {
    const setup = await setupApiKeyUser();
    testUser = setup.testUser;
    testApiKey = setup.testApiKey;
  });

  describe("GET /api/v1/whoami", () => {
    it("should return 401 when no API key is provided", async () => {
      const response = await requestWithApiKey("/api/v1/whoami");

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "API key required" });
    });

    it("should return 401 when invalid API key is provided", async () => {
      const response = await requestWithApiKey("/api/v1/whoami", "invalid_api_key_12345");

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid API key" });
    });

    it("should return user information when valid API key is provided", async () => {
      const response = await requestWithApiKey("/api/v1/whoami", testApiKey);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ ok: true });

      const db = drizzle(env.DB);
      const [userRecord] = await db
        .select()
        .from(user)
        .where(eq(user.id, testUser.id))
        .limit(1);

      expect(userRecord).toBeDefined();
      expect(userRecord.email).toBe(testUser.email);
      expect(userRecord.name).toBe(testUser.name);
    });

    it("should return 401 when API key is disabled", async () => {
      const db = drizzle(env.DB);
      const [apiKeyRecord] = await db
        .select()
        .from(apikey)
        .where(eq(apikey.userId, testUser.id))
        .limit(1);

      await db
        .update(apikey)
        .set({ enabled: false })
        .where(eq(apikey.id, apiKeyRecord.id));

      const response = await requestWithApiKey("/api/v1/whoami", testApiKey);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid API key" });
    });

    it("should handle API key with uppercase header name", async () => {
      const response = await app.request(
        "/api/v1/whoami",
        {
          headers: new Headers({
            "X-API-KEY": testApiKey,
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ ok: true });
    });

    it("should handle multiple API keys for different users", async () => {
      const db = drizzle(env.DB);
      const userId2 = `user_${randomBytes(8).toString("hex")}`;
      const userEmail2 = `test2_${randomBytes(4).toString("hex")}@example.com`;

      await db.insert(user).values({
        id: userId2,
        email: userEmail2,
        name: "Test User 2",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: 2,
      });

      const auth = createAuth(env);
      const apiKeyResult2 = await auth.api.createApiKey({
        body: {
          userId: userId2,
          name: "Test API Key 2",
        },
      });

      const rawApiKey2 = apiKeyResult2.key;

      const response1 = await requestWithApiKey("/api/v1/whoami", testApiKey);
      expect(response1.status).toBe(200);

      const response2 = await requestWithApiKey("/api/v1/whoami", rawApiKey2);
      expect(response2.status).toBe(200);
    });

    it("should return 404 when user is deleted but API key exists", async () => {
      const db = drizzle(env.DB);
      await db.delete(user).where(eq(user.id, testUser.id));

      const response = await requestWithApiKey("/api/v1/whoami", testApiKey);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "User not found" });
    });

    it("should handle empty API key header", async () => {
      const response = await requestWithApiKey("/api/v1/whoami", "");

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "API key required" });
    });

    it("should handle whitespace-only API key", async () => {
      const response = await requestWithApiKey("/api/v1/whoami", "   ");

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "API key required" });
    });

    it("should handle API key with different prefix", async () => {
      const auth = createAuth(env);
      const apiKeyResult3 = await auth.api.createApiKey({
        body: {
          userId: testUser.id,
          name: "Production API Key",
        },
      });

      const rawApiKey3 = apiKeyResult3.key;

      const response = await requestWithApiKey("/api/v1/whoami", rawApiKey3);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ ok: true });
    });

    it("should handle concurrent requests with the same API key", async () => {
      const requests = Array.from({ length: 5 }, () =>
        requestWithApiKey("/api/v1/whoami", testApiKey)
      );

      const responses = await Promise.all(requests);

      for (const response of responses) {
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ ok: true });
      }
    });

    it("should verify database state after successful request", async () => {
      const response = await requestWithApiKey("/api/v1/whoami", testApiKey);

      expect(response.status).toBe(200);

      const db = drizzle(env.DB);
      const [apiKeyRecord] = await db
        .select()
        .from(apikey)
        .where(eq(apikey.userId, testUser.id))
        .limit(1);

      expect(apiKeyRecord).toBeDefined();
      expect(apiKeyRecord.enabled).toBe(true);
      expect(apiKeyRecord.userId).toBe(testUser.id);

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

  describe("Error handling", () => {
    it("should handle malformed API keys gracefully", async () => {
      const malformedKeys = [
        "not-a-valid-key",
        "12345",
        "abcdef",
        "sk_",
        "sk_test_",
        `sk_test_${randomBytes(4).toString("hex")}`,
      ];

      for (const key of malformedKeys) {
        const response = await requestWithApiKey("/api/v1/whoami", key);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data).toEqual({ error: "Invalid API key" });
      }
    });

    it("should handle special characters in API key", async () => {
      const specialKeys = [
        "sk_test_!@#$%^&*()",
        "sk_test_<script>alert('xss')</script>",
        "sk_test_; DROP TABLE users; --",
      ];

      for (const key of specialKeys) {
        const response = await requestWithApiKey("/api/v1/whoami", key);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data).toEqual({ error: "Invalid API key" });
      }
    });

    it("should handle very long API keys", async () => {
      const veryLongKey = `sk_test_${randomBytes(1000).toString("hex")}`;

      const response = await requestWithApiKey("/api/v1/whoami", veryLongKey);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid API key" });
    });
  });

  describe("User and API key lifecycle", () => {
    it("should support user with multiple API keys", async () => {
      const auth = createAuth(env);
      const apiKeyResult2 = await auth.api.createApiKey({
        body: {
          userId: testUser.id,
          name: "API Key 2",
        },
      });

      const apiKeyResult3 = await auth.api.createApiKey({
        body: {
          userId: testUser.id,
          name: "API Key 3",
        },
      });

      const apiKey2 = apiKeyResult2.key;
      const apiKey3 = apiKeyResult3.key;

      const keys = [testApiKey, apiKey2, apiKey3];

      for (const key of keys) {
        const response = await requestWithApiKey("/api/v1/whoami", key);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ ok: true });
      }
    });
  });
});
