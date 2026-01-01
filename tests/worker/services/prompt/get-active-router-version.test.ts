import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt, PromptRouter } from "../../../../worker/db/schema";

describe("PromptService - getActiveRouterVersion", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return router version number when router exists", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const routerVersion = await promptService.getActiveRouterVersion(1, 1, created.id);

    expect(routerVersion).toBe(1);
  });

  it("should return null when router does not exist", async () => {
    const routerVersion = await promptService.getActiveRouterVersion(1, 1, 99999);

    expect(routerVersion).toBeNull();
  });

  it("should return updated version number after prompt update", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBe(1);

    await promptService.updatePrompt(1, 1, created.id, { body: "v2" });

    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBe(2);

    await promptService.updatePrompt(1, 1, created.id, { body: "v3" });

    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBe(3);
  });

  it("should return null when tenantId does not match (cross-tenant protection)", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "T1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Try to get router version with different tenant
    const routerVersion = await promptService.getActiveRouterVersion(2, 1, created.id);

    expect(routerVersion).toBeNull();

    // Verify router exists in database but was filtered
    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<PromptRouter>();

    expect(dbRouter).toBeDefined();
    expect(dbRouter?.version).toBe(1);
  });

  it("should return null when projectId does not match (cross-project protection)", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "P1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Try to get router version with different project
    const routerVersion = await promptService.getActiveRouterVersion(1, 2, created.id);

    expect(routerVersion).toBeNull();

    // Verify router exists in database but was filtered
    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<PromptRouter>();

    expect(dbRouter).toBeDefined();
    expect(dbRouter?.version).toBe(1);
  });

  it("should return correct version when manually set to older version", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    await promptService.updatePrompt(1, 1, created.id, { body: "v2" });
    await promptService.updatePrompt(1, 1, created.id, { body: "v3" });

    // Manually set router to version 2
    await env.DB.prepare(
      "UPDATE PromptRouters SET version = ? WHERE promptId = ?"
    ).bind(2, created.id).run();

    const routerVersion = await promptService.getActiveRouterVersion(1, 1, created.id);

    expect(routerVersion).toBe(2);

    // Verify latest version is still 3
    const dbPrompt = await env.DB.prepare(
      "SELECT latestVersion FROM Prompts WHERE id = ?"
    ).bind(created.id).first<{ latestVersion: number }>();

    expect(dbPrompt?.latestVersion).toBe(3);
  });
});
