import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId } from "../../helpers/id-helpers";
import type { Prompt, PromptVersion, PromptRouter } from "../../../../worker/db/schema";

describe("PromptService - updatePrompt", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should increment version and update prompt data", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Original Name",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"original":true}',
    });

    expect(created.latestVersion).toBe(1);

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.updatePrompt(entityId, {
      name: "Updated Name",
      model: "gpt-4-turbo",
      body: '{"updated":true}',
    });

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt?.name).toBe("Updated Name");
    expect(dbPrompt?.model).toBe("gpt-4-turbo");
    expect(dbPrompt?.body).toBe('{"updated":true}');
    expect(dbPrompt?.provider).toBe("openai");
    expect(dbPrompt?.latestVersion).toBe(2);

    const dbVersion2 = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? AND version = ?"
    ).bind(created.id, 2).first<PromptVersion>();

    expect(dbVersion2).toBeDefined();
    expect(dbVersion2?.name).toBe("Updated Name");
    expect(dbVersion2?.model).toBe("gpt-4-turbo");
    expect(dbVersion2?.body).toBe('{"updated":true}');
    expect(dbVersion2?.provider).toBe("openai");

    const dbVersion1 = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? AND version = ?"
    ).bind(created.id, 1).first<PromptVersion>();

    expect(dbVersion1).toBeDefined();
    expect(dbVersion1?.name).toBe("Original Name");
    expect(dbVersion1?.body).toBe('{"original":true}');

    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<PromptRouter>();

    expect(dbRouter?.version).toBe(2);
  });

  it("should preserve unchanged fields during partial update", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"test":true}',
    });

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.updatePrompt(entityId, {
      name: "New Name Only",
    });

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt?.name).toBe("New Name Only");
    expect(dbPrompt?.provider).toBe("openai");
    expect(dbPrompt?.model).toBe("gpt-4");
    expect(dbPrompt?.body).toBe('{"test":true}');
    expect(dbPrompt?.latestVersion).toBe(2);
  });

  it("should fail when updating non-existent prompt", async () => {
    const entityId = createEntityId(99999, 1, 1);

    await expect(
      promptService.updatePrompt(entityId, { name: "New Name" })
    ).rejects.toThrow("Prompt not found");
  });

  it("should not update prompt when tenantId does not match (cross-tenant protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Tenant 1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongTenantEntityId = createEntityId(created.id, 1, 2);

    await expect(
      promptService.updatePrompt(wrongTenantEntityId, { name: "Hacked Name" })
    ).rejects.toThrow("Prompt not found");

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt?.name).toBe("Tenant 1 Prompt");
    expect(dbPrompt?.latestVersion).toBe(1);
  });

  it("should not update prompt when projectId does not match (cross-project protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Project 1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongProjectEntityId = createEntityId(created.id, 2, 1);

    await expect(
      promptService.updatePrompt(wrongProjectEntityId, { name: "Hacked Name" })
    ).rejects.toThrow("Prompt not found");

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt?.name).toBe("Project 1 Prompt");
    expect(dbPrompt?.latestVersion).toBe(1);
  });

  it("should create multiple versions correctly", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "V1",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    const entityId = createEntityId(created.id, 1, 1);

    await promptService.updatePrompt(entityId, { body: "v2" });
    await promptService.updatePrompt(entityId, { body: "v3" });
    await promptService.updatePrompt(entityId, { body: "v4" });

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt?.latestVersion).toBe(4);
    expect(dbPrompt?.body).toBe("v4");

    const allVersions = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? ORDER BY version"
    ).bind(created.id).all<PromptVersion>();

    expect(allVersions.results).toHaveLength(4);
    expect(allVersions.results[0].body).toBe("v1");
    expect(allVersions.results[1].body).toBe("v2");
    expect(allVersions.results[2].body).toBe("v3");
    expect(allVersions.results[3].body).toBe("v4");
  });
});
