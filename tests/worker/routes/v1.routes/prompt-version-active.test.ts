import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { projects, prompts, promptRouters, promptVersions } from "../../../../worker/db/schema";
import { requestWithApiKey, setupApiKeyUser } from "./helpers";

describe("V1 Prompt Active Version Routes", () => {
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
      latestVersion: 2,
      isActive: true,
    }).returning();

    promptId = prompt.id;

    createdAtV1 = new Date("2024-01-01T00:00:00Z");

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
        body: JSON.stringify({
          messages: [{ role: "user", content: "V1" }],
        }),
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
        body: JSON.stringify({
          messages: [{ role: "user", content: "V2" }],
        }),
      },
    ]);

    await db.insert(promptRouters).values({
      promptId: promptId,
      tenantId: 1,
      projectId: projectId,
      version: 1,
    });
  });

  it("should return the active prompt version from router", async () => {
    const response = await requestWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${promptId}/versions/active`,
      testApiKey
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      version: 1,
      name: "Versioned Prompt",
      slug: "versioned-prompt",
      body: {
        messages: [{ role: "user", content: "V1" }],
      },
      createdAt: createdAtV1.toISOString(),
    });
  });

  it("should find project and prompt by slug", async () => {
    const response = await requestWithApiKey(
      "/api/v1/projects/versioned-project/prompts/versioned-prompt/versions/active",
      testApiKey
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("version", 1);
  });

  it("should return 404 when router is missing", async () => {
    const db = drizzle(env.DB);
    await db.delete(promptRouters);

    const response = await requestWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${promptId}/versions/active`,
      testApiKey
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt version not found" });
  });
});
