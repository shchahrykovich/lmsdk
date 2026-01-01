import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt, PromptVersion, PromptRouter } from "../../../../worker/db/schema";

describe("PromptService - createPrompt", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should create a prompt with version 1 and initial router", async () => {
    const input = {
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"messages":[{"role":"system","content":"Test"}]}',
    };

    const prompt = await promptService.createPrompt(input);

    expect(prompt).toBeDefined();
    expect(prompt.id).toBeGreaterThan(0);
    expect(prompt.name).toBe(input.name);
    expect(prompt.slug).toBe(input.slug);
    expect(prompt.provider).toBe(input.provider);
    expect(prompt.model).toBe(input.model);
    expect(prompt.body).toBe(input.body);
    expect(prompt.latestVersion).toBe(1);
    expect(prompt.isActive).toBe(true);
    expect(prompt.tenantId).toBe(input.tenantId);
    expect(prompt.projectId).toBe(input.projectId);

    // Verify prompt in database using direct SQL
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(prompt.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    expect(dbPrompt?.name).toBe(input.name);
    expect(dbPrompt?.latestVersion).toBe(1);
    expect(dbPrompt?.isActive).toBe(1);

    // Verify version 1 was created
    const dbVersion = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? AND version = ?"
    ).bind(prompt.id, 1).first<PromptVersion>();

    expect(dbVersion).toBeDefined();
    expect(dbVersion?.name).toBe(input.name);
    expect(dbVersion?.provider).toBe(input.provider);
    expect(dbVersion?.model).toBe(input.model);
    expect(dbVersion?.body).toBe(input.body);
    expect(dbVersion?.tenantId).toBe(input.tenantId);
    expect(dbVersion?.projectId).toBe(input.projectId);

    // Verify router was created pointing to version 1
    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(prompt.id).first<PromptRouter>();

    expect(dbRouter).toBeDefined();
    expect(dbRouter?.version).toBe(1);
    expect(dbRouter?.tenantId).toBe(input.tenantId);
    expect(dbRouter?.projectId).toBe(input.projectId);
  });

  it("should create prompts for different tenants with same name/slug", async () => {
    const input1 = {
      tenantId: 1,
      projectId: 1,
      name: "Shared Prompt",
      slug: "shared-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const input2 = {
      tenantId: 2,
      projectId: 1,
      name: "Shared Prompt",
      slug: "shared-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt1 = await promptService.createPrompt(input1);
    const prompt2 = await promptService.createPrompt(input2);

    expect(prompt1.id).not.toBe(prompt2.id);
    expect(prompt1.tenantId).toBe(1);
    expect(prompt2.tenantId).toBe(2);

    // Verify both exist in database
    const countResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Prompts WHERE name = ? AND slug = ?"
    ).bind("Shared Prompt", "shared-prompt").first<{ count: number }>();

    expect(countResult?.count).toBe(2);
  });

  it("should fail when creating duplicate name for same tenant and project", async () => {
    const input = {
      tenantId: 1,
      projectId: 1,
      name: "Duplicate Prompt",
      slug: "unique-slug-1",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    await promptService.createPrompt(input);

    // Try to create another prompt with same name but different slug
    const duplicateInput = {
      ...input,
      slug: "unique-slug-2",
    };

    await expect(promptService.createPrompt(duplicateInput)).rejects.toThrow();
  });

  it("should fail when creating duplicate slug for same tenant and project", async () => {
    const input = {
      tenantId: 1,
      projectId: 1,
      name: "Unique Prompt 1",
      slug: "duplicate-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    await promptService.createPrompt(input);

    // Try to create another prompt with same slug but different name
    const duplicateInput = {
      ...input,
      name: "Unique Prompt 2",
    };

    await expect(promptService.createPrompt(duplicateInput)).rejects.toThrow();
  });
});
