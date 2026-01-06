import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { projects, prompts, promptRouters, promptVersions } from "../../../../worker/db/schema";
import { requestJsonWithApiKey, setupApiKeyUser } from "./helpers";

const mockExecutePrompt = vi.fn();
vi.mock("../../../../worker/services/provider.service", () => ({
  ProviderService: class {
    constructor() {}
    executePrompt = mockExecutePrompt;
  },
}));

describe("V1 Execute Prompt Routes", () => {
  let testApiKey: string;
  let projectId: number;
  let promptId: number;

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
    const setup = await setupApiKeyUser();
    testApiKey = setup.testApiKey;

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

    const db = drizzle(env.DB);
    const [project] = await db.insert(projects).values({
      name: "Test Project",
      slug: "test-project",
      tenantId: 1,
      isActive: true,
    }).returning();

    projectId = project.id;

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

  it("should return 400 when prompt is not active", async () => {
    const db = drizzle(env.DB);

    // Create an inactive prompt
    const inactivePrompt = await createPromptWithRouter(db, {
      name: "Inactive Prompt",
      slug: "inactive-prompt",
      tenantId: 1,
      projectId: projectId,
      provider: "openai",
      model: "gpt-4o-mini",
      body: JSON.stringify({
        messages: [
          { role: "user", content: "This should not execute" }
        ]
      }),
      latestVersion: 1,
      isActive: false,
    });

    const response = await requestJsonWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${inactivePrompt.id}/execute`,
      testApiKey,
      { variables: {} }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt is not active" });
    expect(mockExecutePrompt).not.toHaveBeenCalled();
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

    expect(typeof data.response).toBe("string");
    expect(data.response.toLowerCase()).toContain("alice");
  });

  it("should handle nested variable properties", async () => {
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
    mockExecutePrompt.mockResolvedValueOnce({
      content: JSON.stringify({ greeting: "Hello Charlie!" }),
      model: "gpt-4o-mini",
      usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
      },
    });

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

    expect(typeof data.response).toBe("object");
    expect(data.response).toHaveProperty("greeting");
    expect(typeof data.response.greeting).toBe("string");
  });

  it("should enforce cross-tenant isolation for projects", async () => {
    const db = drizzle(env.DB);
    const [otherProject] = await db.insert(projects).values({
      name: "Other Tenant Project",
      slug: "other-project",
      tenantId: 2,
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
    const db = drizzle(env.DB);
    await db.update(prompts)
      .set({
        latestVersion: 2,
        body: JSON.stringify({
          messages: [{ role: "user", content: "Version 2: {{name}}" }]
        })
      })
      .where(eq(prompts.id, promptId));

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

    const response = await requestJsonWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${promptId}/execute`,
      testApiKey,
      { variables: { name: "Test" } }
    );

    expect(response.status).toBe(200);
  });

  it("should handle missing variables gracefully", async () => {
    const response = await requestJsonWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${promptId}/execute`,
      testApiKey,
      { variables: {} }
    );

    expect(response.status).toBe(200);
  });

  it("should not create log when project is not found", async () => {
    const response = await requestJsonWithApiKey(
      `/api/v1/projects/99999/prompts/${promptId}/execute`,
      testApiKey,
      { variables: { name: "World" } }
    );

    expect(response.status).toBe(404);

    const logResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM PromptExecutionLogs WHERE tenantId = ?"
    ).bind(1).first();

    expect(logResult?.count).toBe(0);
  });
});
