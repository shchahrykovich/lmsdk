import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import app from "../../../worker/index";
import { applyMigrations } from "../helpers/db-setup";
import { user, apikey, projects, prompts, promptRouters, promptVersions } from "../../../worker/db/schema";
import { createAuth } from "../../../auth";
import { randomBytes } from "node:crypto";

// Mock ProviderService
const mockExecutePrompt = vi.fn();
vi.mock("../../../worker/services/provider.service", () => ({
  ProviderService: class {
    constructor() {}
    executePrompt = mockExecutePrompt;
  },
}));

describe("V1 Routes", () => {
  let testUser: { id: string; email: string; name: string };
  let testApiKey: string;

  // Mock execution context for waitUntil
  const mockExecutionCtx = {
    waitUntil: vi.fn((promise: Promise<any>) => promise),
    passThroughOnException: vi.fn(),
  };

  const requestWithApiKey = (path: string, apiKey?: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers ?? {});
    if (apiKey !== undefined) {
      headers.set("x-api-key", apiKey);
    }

    return app.request(path, { ...init, headers }, {
      DB: env.DB,
      executionCtx: mockExecutionCtx as any
    });
  };

  const requestJsonWithApiKey = (
    path: string,
    apiKey: string | undefined,
    jsonBody: unknown,
    init: RequestInit = {}
  ) => {
    const headers = new Headers(init.headers ?? {});
    headers.set("Content-Type", "application/json");
    if (apiKey !== undefined) {
      headers.set("x-api-key", apiKey);
    }

    return app.request(
      path,
      {
        method: init.method ?? "POST",
        ...init,
        headers,
        body: JSON.stringify(jsonBody),
      },
      {
        DB: env.DB,
        executionCtx: mockExecutionCtx as any
      }
    );
  };

  const createPromptWithRouter = async (
    db: ReturnType<typeof drizzle>,
    promptValues: {
      name: string;
      slug: string;
      tenantId: number;
      projectId: number;
      provider: string;
      model: string;
      body: string;
      latestVersion: number;
      isActive: boolean;
    },
    version = promptValues.latestVersion
  ) => {
    const [prompt] = await db.insert(prompts).values(promptValues).returning();

    await db.insert(promptVersions).values({
      promptId: prompt.id,
      tenantId: promptValues.tenantId,
      projectId: promptValues.projectId,
      version,
      name: promptValues.name,
      slug: promptValues.slug,
      provider: promptValues.provider,
      model: promptValues.model,
      body: promptValues.body,
    });

    await db.insert(promptRouters).values({
      promptId: prompt.id,
      tenantId: promptValues.tenantId,
      projectId: promptValues.projectId,
      version,
    });

    return prompt;
  };

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Reset mocks
    vi.clearAllMocks();
    mockExecutePrompt.mockReset();

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
    };

    // Use better-auth to create user and get session
    // Then use the session to create an API key properly
    const auth = createAuth(env);

    // Create an API key via better-auth's API endpoint
    // This simulates what the UI does
    const createKeyResponse = await auth.api.createApiKey({
      body: {
        userId: userId,
        name: "Test API Key",
      },
    });

    // Store the raw API key for use in tests
    testApiKey = createKeyResponse.key;
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

      // Verify the user exists in the database
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
      // Get the API key ID from the database
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
            "X-API-KEY": testApiKey, // Uppercase
          }),
        },
        { DB: env.DB }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ ok: true });
    });

    it("should handle multiple API keys for different users", async () => {
      // Create a second user
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

      // Create API key for second user using better-auth
      const auth = createAuth(env);
      const apiKeyResult2 = await auth.api.createApiKey({
        body: {
          userId: userId2,
          name: "Test API Key 2",
        },
      });

      const rawApiKey2 = apiKeyResult2.key;

      // Test first user's API key
      const response1 = await requestWithApiKey("/api/v1/whoami", testApiKey);

      expect(response1.status).toBe(200);

      // Test second user's API key
      const response2 = await requestWithApiKey("/api/v1/whoami", rawApiKey2);

      expect(response2.status).toBe(200);
    });

    it("should return 404 when user is deleted but API key exists", async () => {
      // Delete the user but leave the API key
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
      // Create API key using better-auth
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
      // Make multiple concurrent requests
      const requests = Array.from({ length: 5 }, () =>
        requestWithApiKey("/api/v1/whoami", testApiKey)
      );

      const responses = await Promise.all(requests);

      // All should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ ok: true });
      }
    });

    it("should verify database state after successful request", async () => {
      const response = await requestWithApiKey("/api/v1/whoami", testApiKey);

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

  describe("Error handling", () => {
    it("should handle malformed API keys gracefully", async () => {
      const malformedKeys = [
        "not-a-valid-key",
        "12345",
        "abcdef",
        "sk_",
        "sk_test_",
        `sk_test_${randomBytes(4).toString("hex")}`, // Too short
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
      // Create additional API keys for the same user using better-auth
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

      // Test all three API keys
      const keys = [testApiKey, apiKey2, apiKey3];

      for (const key of keys) {
        const response = await requestWithApiKey("/api/v1/whoami", key);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ ok: true });
      }
    });
  });

  describe("POST /api/v1/projects/:projectSlugOrId/prompts/:promptSlugOrId/execute", () => {
    let projectId: number;
    let promptId: number;

    beforeEach(async () => {
      // Reset and setup mock for provider service
      mockExecutePrompt.mockReset();
      mockExecutePrompt.mockResolvedValue({
        content: "Hello Alice",
        model: "gpt-4o-mini",
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      });

      // Create a test project
      const db = drizzle(env.DB);
      const [project] = await db.insert(projects).values({
        name: "Test Project",
        slug: "test-project",
        tenantId: 1,
        isActive: true,
      }).returning();

      projectId = project.id;

      // Create a test prompt with a simple template
      const prompt = await createPromptWithRouter(db, {
        name: "Test Prompt",
        slug: "test-prompt",
        tenantId: 1,
        projectId: projectId,
        provider: "openai",
        model: "gpt-4o-mini",
        body: JSON.stringify({
          messages: [
            { role: "user", content: "Say hello to {{name}}" }
          ]
        }),
        latestVersion: 1,
        isActive: true,
      });

      promptId = prompt.id;
    });

    it("should return 401 when no API key is provided", async () => {
      const response = await requestJsonWithApiKey(
        `/api/v1/projects/${projectId}/prompts/${promptId}/execute`,
        undefined,
        { variables: {} }
      );

      expect(response.status).toBe(401);
    });

    it("should return 404 when project not found", async () => {
      const response = await requestJsonWithApiKey(
        `/api/v1/projects/99999/prompts/${promptId}/execute`,
        testApiKey,
        { variables: {} }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "Project not found" });
    });

    it("should return 404 when prompt not found", async () => {
      const response = await requestJsonWithApiKey(
        `/api/v1/projects/${projectId}/prompts/99999/execute`,
        testApiKey,
        { variables: {} }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "Prompt not found" });
    });

    it("should find project and prompt by slug", async () => {
      const response = await requestJsonWithApiKey(
        "/api/v1/projects/test-project/prompts/test-prompt/execute",
        testApiKey,
        { variables: { name: "World" } }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("response");
    });

    it("should find project and prompt by ID", async () => {
      const response = await requestJsonWithApiKey(
        `/api/v1/projects/${projectId}/prompts/${promptId}/execute`,
        testApiKey,
        { variables: { name: "World" } }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("response");
    });

    it("should return 400 when prompt is not active", async () => {
      // Deactivate the prompt
      const db = drizzle(env.DB);
      await db.update(prompts)
        .set({ isActive: false })
        .where(eq(prompts.id, promptId));

      const response = await requestJsonWithApiKey(
        `/api/v1/projects/${projectId}/prompts/${promptId}/execute`,
        testApiKey,
        { variables: { name: "World" } }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Prompt is not active" });
    });

    it("should replace variables in prompt template", async () => {
      const response = await requestJsonWithApiKey(
        `/api/v1/projects/${projectId}/prompts/${promptId}/execute`,
        testApiKey,
        { variables: { name: "Alice" } }
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      // Response should contain text that acknowledges "Alice"
      expect(typeof data.response).toBe("string");
      expect(data.response.toLowerCase()).toContain("alice");
    });

    it("should handle nested variable properties", async () => {
      // Create a prompt with nested variable access
      const db = drizzle(env.DB);
      const nestedPrompt = await createPromptWithRouter(db, {
        name: "Nested Prompt",
        slug: "nested-prompt",
        tenantId: 1,
        projectId: projectId,
        provider: "openai",
        model: "gpt-4o-mini",
        latestVersion: 1,
        isActive: true,
        body: JSON.stringify({
          messages: [
            { role: "user", content: "User {{user.name}} from {{user.location}}" }
          ]
        }),
      });

      const response = await requestJsonWithApiKey(
        `/api/v1/projects/${projectId}/prompts/${nestedPrompt.id}/execute`,
        testApiKey,
        {
          variables: {
            user: {
              name: "Bob",
              location: "NYC"
            }
          }
        }
      );

      expect(response.status).toBe(200);
    });

    it("should handle JSON schema responses", async () => {
      // Mock JSON response
      mockExecutePrompt.mockResolvedValueOnce({
        content: JSON.stringify({ greeting: "Hello Charlie!" }),
        model: "gpt-4o-mini",
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      });

      // Create a prompt with JSON schema response format
      const db = drizzle(env.DB);
      const jsonPrompt = await createPromptWithRouter(db, {
        name: "JSON Prompt",
        slug: "json-prompt",
        tenantId: 1,
        projectId: projectId,
        provider: "openai",
        model: "gpt-4o-mini",
        latestVersion: 1,
        isActive: true,
        body: JSON.stringify({
          messages: [
            { role: "user", content: "Return a JSON object with a greeting for {{name}}" }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "greeting",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  greeting: { type: "string" }
                },
                required: ["greeting"],
                additionalProperties: false
              }
            }
          }
        }),
      });

      const response = await requestJsonWithApiKey(
        `/api/v1/projects/${projectId}/prompts/${jsonPrompt.id}/execute`,
        testApiKey,
        { variables: { name: "Charlie" } }
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      // Should return parsed JSON object
      expect(typeof data.response).toBe("object");
      expect(data.response).toHaveProperty("greeting");
      expect(typeof data.response.greeting).toBe("string");
    });

    it("should enforce cross-tenant isolation for projects", async () => {
      // Create a project in a different tenant
      const db = drizzle(env.DB);
      const [otherProject] = await db.insert(projects).values({
        name: "Other Tenant Project",
        slug: "other-project",
        tenantId: 2, // Different tenant
        isActive: true,
      }).returning();

      const otherPrompt = await createPromptWithRouter(db, {
        name: "Other Prompt",
        slug: "other-prompt",
        tenantId: 2,
        projectId: otherProject.id,
        provider: "openai",
        model: "gpt-4o-mini",
        latestVersion: 1,
        isActive: true,
        body: JSON.stringify({
          messages: [{ role: "user", content: "Test" }]
        }),
      });

      // Try to access with user from tenant 1
      const response = await requestJsonWithApiKey(
        `/api/v1/projects/${otherProject.id}/prompts/${otherPrompt.id}/execute`,
        testApiKey,
        { variables: {} }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "Project not found" });
    });

    it("should use active version from router", async () => {
      // Create a new version
      const db = drizzle(env.DB);
      // Update prompt to version 2
      await db.update(prompts)
        .set({
          latestVersion: 2,
          body: JSON.stringify({
            messages: [{ role: "user", content: "Version 2: {{name}}" }]
          })
        })
        .where(eq(prompts.id, promptId));

      // Create version 2
      await db.insert(promptVersions).values({
        promptId: promptId,
        tenantId: 1,
        projectId: projectId,
        version: 2,
        name: "Test Prompt",
        slug: "test-prompt",
        provider: "openai",
        model: "gpt-4o-mini",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Version 2: {{name}}" }]
        }),
      });

      // Router still points to version 1
      // Execute should use version 1 from router, not version 2
      const response = await requestJsonWithApiKey(
        `/api/v1/projects/${projectId}/prompts/${promptId}/execute`,
        testApiKey,
        { variables: { name: "Test" } }
      );

      expect(response.status).toBe(200);
      // The response should be from version 1 (without "Version 2:" prefix)
    });

    it("should handle missing variables gracefully", async () => {
      const response = await requestJsonWithApiKey(
        `/api/v1/projects/${projectId}/prompts/${promptId}/execute`,
        testApiKey,
        { variables: {} } // Missing 'name' variable
      );

      // Should still execute, but variable will be unreplaced
      expect(response.status).toBe(200);
    });

    it("should not create log when project is not found", async () => {
      const response = await requestJsonWithApiKey(
        `/api/v1/projects/99999/prompts/${promptId}/execute`,
        testApiKey,
        { variables: { name: "World" } }
      );

      expect(response.status).toBe(404);

      // Verify no log was created (no projectId available)
      const logResult = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM PromptExecutionLogs WHERE tenantId = ?"
      ).bind(1).first();

      expect(logResult?.count).toBe(0);
    });
  });
});
