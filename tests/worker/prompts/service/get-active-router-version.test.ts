import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId } from "../../helpers/id-helpers";
import type { Prompt, PromptRouter } from "../../../../worker/db/schema";

describe("PromptService - getActiveRouterVersion", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return router version number when router exists", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(created.id, 1, 1);
    const routerVersion = await promptService.getActiveRouterVersion(entityId);

    expect(routerVersion).toBe(1);
  });

  it("should return null when router does not exist", async () => {
    const entityId = createEntityId(99999, 1, 1);
    const routerVersion = await promptService.getActiveRouterVersion(entityId);

    expect(routerVersion).toBeNull();
  });

  it("should return updated version number after prompt update", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    const entityId = createEntityId(created.id, 1, 1);

    expect(await promptService.getActiveRouterVersion(entityId)).toBe(1);

    await promptService.updatePrompt(entityId, { body: "v2" });

    expect(await promptService.getActiveRouterVersion(entityId)).toBe(2);

    await promptService.updatePrompt(entityId, { body: "v3" });

    expect(await promptService.getActiveRouterVersion(entityId)).toBe(3);
  });

  it("should return null when tenantId does not match (cross-tenant protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "T1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongTenantEntityId = createEntityId(created.id, 1, 2);
    const routerVersion = await promptService.getActiveRouterVersion(wrongTenantEntityId);

    expect(routerVersion).toBeNull();

    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<PromptRouter>();

    expect(dbRouter).toBeDefined();
    expect(dbRouter?.version).toBe(1);
  });

  it("should return null when projectId does not match (cross-project protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "P1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongProjectEntityId = createEntityId(created.id, 2, 1);
    const routerVersion = await promptService.getActiveRouterVersion(wrongProjectEntityId);

    expect(routerVersion).toBeNull();

    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<PromptRouter>();

    expect(dbRouter).toBeDefined();
    expect(dbRouter?.version).toBe(1);
  });

  it("should return correct version when manually set to older version", async () => {
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

    await env.DB.prepare(
      "UPDATE PromptRouters SET version = ? WHERE promptId = ?"
    ).bind(2, created.id).run();

    const routerVersion = await promptService.getActiveRouterVersion(entityId);

    expect(routerVersion).toBe(2);

    const dbPrompt = await env.DB.prepare(
      "SELECT latestVersion FROM Prompts WHERE id = ?"
    ).bind(created.id).first<{ latestVersion: number }>();

    expect(dbPrompt?.latestVersion).toBe(3);
  });
});
