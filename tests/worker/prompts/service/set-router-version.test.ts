import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId } from "../../helpers/id-helpers";
import type { PromptRouter } from "../../../../worker/db/schema";

describe("PromptService - setRouterVersion", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should update router to specified version", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.updatePrompt(entityId, { body: "v2" });
    await promptService.updatePrompt(entityId, { body: "v3" });

    expect(await promptService.getActiveRouterVersion(entityId)).toBe(3);

    await promptService.setRouterVersion(entityId, 2);

    const dbRouter = await env.DB.prepare(
      "SELECT version FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<{ version: number }>();

    expect(dbRouter?.version).toBe(2);
    expect(await promptService.getActiveRouterVersion(entityId)).toBe(2);
  });

  it("should set router to version 1", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.updatePrompt(entityId, { body: "v2" });

    await promptService.setRouterVersion(entityId, 1);

    const routerVersion = await promptService.getActiveRouterVersion(entityId);
    expect(routerVersion).toBe(1);
  });

  it("should create router if it does not exist", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    await env.DB.prepare(
      "DELETE FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).run();

    const entityId = createEntityId(created.id, 1, 1);
    expect(await promptService.getActiveRouterVersion(entityId)).toBeNull();

    await promptService.setRouterVersion(entityId, 1);

    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<PromptRouter>();

    expect(dbRouter).toBeDefined();
    expect(dbRouter?.version).toBe(1);
    expect(dbRouter?.tenantId).toBe(1);
    expect(dbRouter?.projectId).toBe(1);
  });

  it("should throw error when version does not exist", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    const entityId = createEntityId(created.id, 1, 1);

    await expect(
      promptService.setRouterVersion(entityId, 99)
    ).rejects.toThrow("Version not found");

    const routerVersion = await promptService.getActiveRouterVersion(entityId);
    expect(routerVersion).toBe(1);
  });

  it("should enforce cross-tenant protection", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "T1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.updatePrompt(entityId, { body: "v2" });

    const wrongTenantEntityId = createEntityId(created.id, 1, 2);

    await expect(
      promptService.setRouterVersion(wrongTenantEntityId, 2)
    ).rejects.toThrow("Version not found");

    const dbRouter = await env.DB.prepare(
      "SELECT version FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<{ version: number }>();

    expect(dbRouter?.version).toBe(2);
  });

  it("should enforce cross-project protection", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "P1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.updatePrompt(entityId, { body: "v2" });

    const wrongProjectEntityId = createEntityId(created.id, 2, 1);

    await expect(
      promptService.setRouterVersion(wrongProjectEntityId, 2)
    ).rejects.toThrow("Version not found");

    const dbRouter = await env.DB.prepare(
      "SELECT version FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<{ version: number }>();

    expect(dbRouter?.version).toBe(2);
  });

  it("should allow setting router to any existing version", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.updatePrompt(entityId, { body: "v2" });
    await promptService.updatePrompt(entityId, { body: "v3" });
    await promptService.updatePrompt(entityId, { body: "v4" });
    await promptService.updatePrompt(entityId, { body: "v5" });

    expect(await promptService.getActiveRouterVersion(entityId)).toBe(5);

    await promptService.setRouterVersion(entityId, 3);
    expect(await promptService.getActiveRouterVersion(entityId)).toBe(3);

    await promptService.setRouterVersion(entityId, 1);
    expect(await promptService.getActiveRouterVersion(entityId)).toBe(1);

    await promptService.setRouterVersion(entityId, 5);
    expect(await promptService.getActiveRouterVersion(entityId)).toBe(5);

    await promptService.setRouterVersion(entityId, 2);
    expect(await promptService.getActiveRouterVersion(entityId)).toBe(2);
  });

  it("should not affect prompt latestVersion when setting router", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.updatePrompt(entityId, { body: "v2" });
    await promptService.updatePrompt(entityId, { body: "v3" });

    await promptService.setRouterVersion(entityId, 1);

    const dbPrompt = await env.DB.prepare(
      "SELECT latestVersion FROM Prompts WHERE id = ?"
    ).bind(created.id).first<{ latestVersion: number }>();

    expect(dbPrompt?.latestVersion).toBe(3);
  });

  it("should handle multiple prompts with independent routers", async () => {
    const projectId = createProjectId(1, 1);

    const p1 = await promptService.createPrompt(projectId, {
      name: "Prompt 1",
      slug: "prompt-1",
      provider: "openai",
      model: "gpt-4",
      body: "p1-v1",
    });

    const p2 = await promptService.createPrompt(projectId, {
      name: "Prompt 2",
      slug: "prompt-2",
      provider: "openai",
      model: "gpt-4",
      body: "p2-v1",
    });

    const entityId1 = createEntityId(p1.id, 1, 1);
    const entityId2 = createEntityId(p2.id, 1, 1);

    await promptService.updatePrompt(entityId1, { body: "p1-v2" });
    await promptService.updatePrompt(entityId1, { body: "p1-v3" });
    await promptService.updatePrompt(entityId2, { body: "p2-v2" });

    await promptService.setRouterVersion(entityId1, 2);
    await promptService.setRouterVersion(entityId2, 1);

    expect(await promptService.getActiveRouterVersion(entityId1)).toBe(2);
    expect(await promptService.getActiveRouterVersion(entityId2)).toBe(1);
  });
});
