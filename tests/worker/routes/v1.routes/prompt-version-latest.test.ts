import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { projects, prompts, promptVersions } from "../../../../worker/db/schema";
import { requestWithApiKey, setupApiKeyUser } from "./helpers";

describe("V1 Prompt Latest Version Routes", () => {
  let testApiKey: string;
  let projectId: number;
  let promptId: number;
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
        body: JSON.stringify({
          messages: [{ role: "user", content: "V1" }],
        }),
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
        createdAt: createdAtV2,
      },
    ]);
  });

  it("should return the latest prompt version", async () => {
    const response = await requestWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${promptId}/versions/latest`,
      testApiKey
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      version: 2,
      name: "Versioned Prompt",
      slug: "versioned-prompt",
      body: {
        messages: [{ role: "user", content: "V2" }],
      },
      createdAt: createdAtV2.toISOString(),
    });
  });

  it("should find project and prompt by slug", async () => {
    const response = await requestWithApiKey(
      "/api/v1/projects/versioned-project/prompts/versioned-prompt/versions/latest",
      testApiKey
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("version", 2);
  });

  it("should return 404 when prompt not found", async () => {
    const response = await requestWithApiKey(
      `/api/v1/projects/${projectId}/prompts/99999/versions/latest`,
      testApiKey
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt not found" });
  });

  it("should return 400 when prompt is not active", async () => {
    const db = drizzle(env.DB);

    // Deactivate the prompt
    await db.update(prompts).set({ isActive: false }).where(eq(prompts.id, promptId));

    const response = await requestWithApiKey(
      `/api/v1/projects/${projectId}/prompts/${promptId}/versions/latest`,
      testApiKey
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Prompt is not active" });
  });
});
