import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId } from "../../helpers/id-helpers";
import type { Prompt, PromptVersion, PromptRouter } from "../../../../worker/db/schema";

describe("PromptService - createPrompt", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should create a prompt with version 1 and initial router", async () => {
    const projectId = createProjectId(1, 1);
    const input = {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"messages":[{"role":"system","content":"Test"}]}',
    };

    const prompt = await promptService.createPrompt(projectId, input);

    expect(prompt).toBeDefined();
    expect(prompt.id).toBeGreaterThan(0);
    expect(prompt.name).toBe(input.name);
    expect(prompt.slug).toBe(input.slug);
    expect(prompt.provider).toBe(input.provider);
    expect(prompt.model).toBe(input.model);
    expect(prompt.body).toBe(input.body);
    expect(prompt.latestVersion).toBe(1);
    expect(prompt.isActive).toBe(true);
    expect(prompt.tenantId).toBe(1);
    expect(prompt.projectId).toBe(1);

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
    expect(dbVersion?.tenantId).toBe(1);
    expect(dbVersion?.projectId).toBe(1);

    // Verify router was created pointing to version 1
    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(prompt.id).first<PromptRouter>();

    expect(dbRouter).toBeDefined();
    expect(dbRouter?.version).toBe(1);
    expect(dbRouter?.tenantId).toBe(1);
    expect(dbRouter?.projectId).toBe(1);
  });

  it("should create prompts for different tenants with same name/slug", async () => {
    const tenant1Project = createProjectId(1, 1);
    const tenant2Project = createProjectId(1, 2);
    const input = {
      name: "Shared Prompt",
      slug: "shared-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt1 = await promptService.createPrompt(tenant1Project, input);
    const prompt2 = await promptService.createPrompt(tenant2Project, input);

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
    const projectId = createProjectId(1, 1);

    await promptService.createPrompt(projectId, {
      name: "Duplicate Prompt",
      slug: "unique-slug-1",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await expect(promptService.createPrompt(projectId, {
      name: "Duplicate Prompt",
      slug: "unique-slug-2",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    })).rejects.toThrow();
  });

  it("should fail when creating duplicate slug for same tenant and project", async () => {
    const projectId = createProjectId(1, 1);

    await promptService.createPrompt(projectId, {
      name: "Unique Prompt 1",
      slug: "duplicate-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await expect(promptService.createPrompt(projectId, {
      name: "Unique Prompt 2",
      slug: "duplicate-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    })).rejects.toThrow();
  });
});
