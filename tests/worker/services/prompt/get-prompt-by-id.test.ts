import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - getPromptById", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return prompt with current version when found", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const result = await promptService.getPromptById(1, 1, created.id);

    expect(result).toBeDefined();
    expect(result?.id).toBe(created.id);
    expect(result?.name).toBe("Test Prompt");
    expect(result?.currentVersion).toBeDefined();
    expect(result?.currentVersion?.version).toBe(1);
    expect(result?.currentVersion?.name).toBe("Test Prompt");
  });

  it("should return null when prompt does not exist", async () => {
    const result = await promptService.getPromptById(1, 1, 99999);

    expect(result).toBeNull();
  });

  it("should return null when tenantId does not match (cross-tenant protection)", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Tenant 1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Try to access with tenant 2
    const result = await promptService.getPromptById(2, 1, created.id);

    expect(result).toBeNull();

    // Verify prompt exists in database
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    expect(dbPrompt?.tenantId).toBe(1);

    // Verify correct tenant can access
    const correctResult = await promptService.getPromptById(1, 1, created.id);
    expect(correctResult).toBeDefined();
  });

  it("should return null when projectId does not match (cross-project protection)", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Project 1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Try to access with project 2
    const result = await promptService.getPromptById(1, 2, created.id);

    expect(result).toBeNull();

    // Verify prompt exists in database
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    expect(dbPrompt?.projectId).toBe(1);
  });

  it("should return latest version after updates", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "V1",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    // Update to version 2
    await promptService.updatePrompt(1, 1, created.id, { body: "v2" });

    // Update to version 3
    await promptService.updatePrompt(1, 1, created.id, { body: "v3" });

    const result = await promptService.getPromptById(1, 1, created.id);

    expect(result?.latestVersion).toBe(3);
    expect(result?.body).toBe("v3");
    expect(result?.currentVersion?.version).toBe(3);
    expect(result?.currentVersion?.body).toBe("v3");
  });
});
