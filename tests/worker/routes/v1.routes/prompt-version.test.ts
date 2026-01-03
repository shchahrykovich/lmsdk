import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { projects, prompts, promptVersions } from "../../../../worker/db/schema";
import { requestWithApiKey, setupApiKeyUser } from "./helpers";

describe("V1 Prompt Version Routes", () => {
  let testApiKey: string;
  let projectId: number;
  let promptId: number;
  let createdAtV1: Date;

  beforeEach(async () => {
    const setup = await setupApiKeyUser();
    testApiKey = setup.testApiKey;

    const db = drizzle(env.DB);

    const [project] = await db.insert(projects).values({
      name: "Versioned Project",
      slug: "versioned-project",
      tenantId: 1,
      isActive: true,
    }).returning();

    projectId = project.id;

    const [prompt] = await db.insert(prompts).values({
      name: "Versioned Prompt",
      slug: "versioned-prompt",
      tenantId: 1,
      projectId: projectId,
      provider: "openai",
      model: "gpt-4o-mini",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    }).returning();

    promptId = prompt.id;

    createdAtV1 = new Date("2024-01-01T00:00:00Z");

    await db.insert(promptVersions).values({
      promptId: promptId,
      tenantId: 1,
      projectId: projectId,
      version: 1,
      name: "Versioned Prompt",
      slug: "versioned-prompt",
      provider: "openai",
      model: "gpt-4o-mini",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
      createdAt: createdAtV1,
    });
  });

  it("should return a prompt version with parsed body", async () => {
    const response = await requestWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${promptId}/versions/1`,
      testApiKey
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      version: 1,
      name: "Versioned Prompt",
      slug: "versioned-prompt",
      body: {
        messages: [{ role: "user", content: "Hello" }],
      },
      createdAt: createdAtV1.toISOString(),
    });
  });

  it("should return 404 when prompt version not found", async () => {
    const response = await requestWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${promptId}/versions/99`,
      testApiKey
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt version not found" });
  });

  it("should return 400 for invalid version id", async () => {
    const response = await requestWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${promptId}/versions/not-a-number`,
      testApiKey
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid version ID" });
  });
});
