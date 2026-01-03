import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { projects, prompts, promptVersions } from "../../../../worker/db/schema";
import { requestWithApiKey, setupApiKeyUser } from "./helpers";

describe("V1 Prompt Versions Routes", () => {
  let testApiKey: string;
  let projectId: number;
  let promptId: number;
  let createdAtV1: Date;
  let createdAtV2: Date;

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
      latestVersion: 2,
      isActive: true,
    }).returning();

    promptId = prompt.id;

    createdAtV1 = new Date("2024-01-01T00:00:00Z");
    createdAtV2 = new Date("2024-01-02T00:00:00Z");

    await db.insert(promptVersions).values([
      {
        promptId: promptId,
        tenantId: 1,
        projectId: projectId,
        version: 1,
        name: "Versioned Prompt",
        slug: "versioned-prompt",
        provider: "openai",
        model: "gpt-4o-mini",
        body: "{}",
        createdAt: createdAtV1,
      },
      {
        promptId: promptId,
        tenantId: 1,
        projectId: projectId,
        version: 2,
        name: "Versioned Prompt",
        slug: "versioned-prompt",
        provider: "openai",
        model: "gpt-4o-mini",
        body: "{}",
        createdAt: createdAtV2,
      },
    ]);
  });

  it("should return versions ordered by newest first", async () => {
    const response = await requestWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${promptId}/versions`,
      testApiKey
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toEqual([
      { version: 2, createdAt: createdAtV2.toISOString() },
      { version: 1, createdAt: createdAtV1.toISOString() },
    ]);
  });

  it("should find project and prompt by slug", async () => {
    const response = await requestWithApiKey(
      "/api/v1/projects/versioned-project/prompts/versioned-prompt/versions",
      testApiKey
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(2);
    expect(data[0]).toHaveProperty("version", 2);
  });

  it("should return 404 when project not found", async () => {
    const response = await requestWithApiKey(
      `/api/v1/projects/99999/prompts/${promptId}/versions`,
      testApiKey
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Project not found" });
  });
});
