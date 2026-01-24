import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId } from "../../helpers/id-helpers";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - getPromptById", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return prompt with current version when found", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(created.id, 1, 1);
    const result = await promptService.getPromptById(entityId);

    expect(result).toBeDefined();
    expect(result?.id).toBe(created.id);
    expect(result?.name).toBe("Test Prompt");
    expect(result?.currentVersion).toBeDefined();
    expect(result?.currentVersion?.version).toBe(1);
    expect(result?.currentVersion?.name).toBe("Test Prompt");
  });

  it("should return null when prompt does not exist", async () => {
    const entityId = createEntityId(99999, 1, 1);
    const result = await promptService.getPromptById(entityId);

    expect(result).toBeNull();
  });

  it("should return null when tenantId does not match (cross-tenant protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Tenant 1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongTenantEntityId = createEntityId(created.id, 1, 2);
    const result = await promptService.getPromptById(wrongTenantEntityId);

    expect(result).toBeNull();

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    expect(dbPrompt?.tenantId).toBe(1);

    const correctEntityId = createEntityId(created.id, 1, 1);
    const correctResult = await promptService.getPromptById(correctEntityId);
    expect(correctResult).toBeDefined();
  });

  it("should return null when projectId does not match (cross-project protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Project 1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongProjectEntityId = createEntityId(created.id, 2, 1);
    const result = await promptService.getPromptById(wrongProjectEntityId);

    expect(result).toBeNull();

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    expect(dbPrompt?.projectId).toBe(1);
  });

  it("should return latest version after updates", async () => {
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

    const result = await promptService.getPromptById(entityId);

    expect(result?.latestVersion).toBe(3);
    expect(result?.body).toBe("v3");
    expect(result?.currentVersion?.version).toBe(3);
    expect(result?.currentVersion?.body).toBe("v3");
  });
});
