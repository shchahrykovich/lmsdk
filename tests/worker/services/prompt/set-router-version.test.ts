import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt, PromptRouter } from "../../../../worker/db/schema";

describe("PromptService - setRouterVersion", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should update router to specified version", async () => {
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

    // Router should be at version 3
    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBe(3);

    // Set router to version 2
    await promptService.setRouterVersion(1, 1, created.id, 2);

    // Verify router was updated using direct SQL
    const dbRouter = await env.DB.prepare(
      "SELECT version FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<{ version: number }>();

    expect(dbRouter?.version).toBe(2);

    // Also verify using service method
    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBe(2);
  });

  it("should set router to version 1", async () => {
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

    // Set router back to version 1
    await promptService.setRouterVersion(1, 1, created.id, 1);

    const routerVersion = await promptService.getActiveRouterVersion(1, 1, created.id);

    expect(routerVersion).toBe(1);
  });

  it("should create router if it does not exist", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    // Delete the router
    await env.DB.prepare(
      "DELETE FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).run();

    // Verify router is gone
    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBeNull();

    // Set router version (should create new router)
    await promptService.setRouterVersion(1, 1, created.id, 1);

    // Verify router was created
    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<PromptRouter>();

    expect(dbRouter).toBeDefined();
    expect(dbRouter?.version).toBe(1);
    expect(dbRouter?.tenantId).toBe(1);
    expect(dbRouter?.projectId).toBe(1);
  });

  it("should throw error when version does not exist", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    // Try to set router to non-existent version
    await expect(
      promptService.setRouterVersion(1, 1, created.id, 99)
    ).rejects.toThrow("Version not found");

    // Verify router was not changed
    const routerVersion = await promptService.getActiveRouterVersion(1, 1, created.id);
    expect(routerVersion).toBe(1);
  });

  it("should enforce cross-tenant protection", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "T1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    await promptService.updatePrompt(1, 1, created.id, { body: "v2" });

    // Try to set router with different tenant (should fail)
    await expect(
      promptService.setRouterVersion(2, 1, created.id, 2)
    ).rejects.toThrow("Version not found");

    // Verify router was not changed
    const dbRouter = await env.DB.prepare(
      "SELECT version FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<{ version: number }>();

    expect(dbRouter?.version).toBe(2); // Still at version 2
  });

  it("should enforce cross-project protection", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "P1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    await promptService.updatePrompt(1, 1, created.id, { body: "v2" });

    // Try to set router with different project (should fail)
    await expect(
      promptService.setRouterVersion(1, 2, created.id, 2)
    ).rejects.toThrow("Version not found");

    // Verify router was not changed
    const dbRouter = await env.DB.prepare(
      "SELECT version FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<{ version: number }>();

    expect(dbRouter?.version).toBe(2); // Still at version 2
  });

  it("should allow setting router to any existing version", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    // Create versions 2, 3, 4, 5
    await promptService.updatePrompt(1, 1, created.id, { body: "v2" });
    await promptService.updatePrompt(1, 1, created.id, { body: "v3" });
    await promptService.updatePrompt(1, 1, created.id, { body: "v4" });
    await promptService.updatePrompt(1, 1, created.id, { body: "v5" });

    // Router should be at version 5
    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBe(5);

    // Set to version 3
    await promptService.setRouterVersion(1, 1, created.id, 3);
    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBe(3);

    // Set to version 1
    await promptService.setRouterVersion(1, 1, created.id, 1);
    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBe(1);

    // Set to version 5
    await promptService.setRouterVersion(1, 1, created.id, 5);
    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBe(5);

    // Set to version 2
    await promptService.setRouterVersion(1, 1, created.id, 2);
    expect(await promptService.getActiveRouterVersion(1, 1, created.id)).toBe(2);
  });

  it("should not affect prompt latestVersion when setting router", async () => {
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

    // Set router to version 1
    await promptService.setRouterVersion(1, 1, created.id, 1);

    // Verify latest version is still 3
    const dbPrompt = await env.DB.prepare(
      "SELECT latestVersion FROM Prompts WHERE id = ?"
    ).bind(created.id).first<{ latestVersion: number }>();

    expect(dbPrompt?.latestVersion).toBe(3);
  });

  it("should handle multiple prompts with independent routers", async () => {
    const p1 = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Prompt 1",
      slug: "prompt-1",
      provider: "openai",
      model: "gpt-4",
      body: "p1-v1",
    });

    const p2 = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Prompt 2",
      slug: "prompt-2",
      provider: "openai",
      model: "gpt-4",
      body: "p2-v1",
    });

    // Create more versions for both
    await promptService.updatePrompt(1, 1, p1.id, { body: "p1-v2" });
    await promptService.updatePrompt(1, 1, p1.id, { body: "p1-v3" });
    await promptService.updatePrompt(1, 1, p2.id, { body: "p2-v2" });

    // Set different router versions
    await promptService.setRouterVersion(1, 1, p1.id, 2);
    await promptService.setRouterVersion(1, 1, p2.id, 1);

    // Verify routers are independent
    expect(await promptService.getActiveRouterVersion(1, 1, p1.id)).toBe(2);
    expect(await promptService.getActiveRouterVersion(1, 1, p2.id)).toBe(1);
  });
});
