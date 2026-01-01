import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - getPromptBySlug", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return prompt when slug and tenantId match", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const prompt = await promptService.getPromptBySlug(1, 1, "test-prompt");

    expect(prompt).toBeDefined();
    expect(prompt?.id).toBe(created.id);
    expect(prompt?.slug).toBe("test-prompt");
    expect(prompt?.name).toBe("Test Prompt");
    expect(prompt?.tenantId).toBe(1);
    expect(prompt?.projectId).toBe(1);
  });

  it("should return undefined when slug does not exist", async () => {
    const prompt = await promptService.getPromptBySlug(1, 1, "non-existent");

    expect(prompt).toBeUndefined();
  });

  it("should return undefined when slug exists but tenantId does not match (cross-tenant protection)", async () => {
    await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Tenant 1 Prompt",
      slug: "shared-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Try to access with different tenant
    const prompt = await promptService.getPromptBySlug(2, 1, "shared-slug");

    expect(prompt).toBeUndefined();

    // Verify it exists in database but was filtered
    const dbResult = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE slug = ?"
    ).bind("shared-slug").first<Prompt>();

    expect(dbResult?.tenantId).toBe(1);
  });

  it("should return undefined when slug exists but projectId does not match (cross-project protection)", async () => {
    await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Project 1 Prompt",
      slug: "project-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Try to access with different project
    const prompt = await promptService.getPromptBySlug(1, 2, "project-prompt");

    expect(prompt).toBeUndefined();

    // Verify it exists in database but was filtered
    const dbResult = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE slug = ?"
    ).bind("project-prompt").first<Prompt>();

    expect(dbResult?.projectId).toBe(1);
  });

  it("should handle same slug across different tenants correctly", async () => {
    // Create prompts with same slug in different tenants
    const t1Prompt = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Tenant 1 Version",
      slug: "common-slug",
      provider: "openai",
      model: "gpt-4",
      body: '{"tenant":1}',
    });

    const t2Prompt = await promptService.createPrompt({
      tenantId: 2,
      projectId: 1,
      name: "Tenant 2 Version",
      slug: "common-slug",
      provider: "openai",
      model: "gpt-4",
      body: '{"tenant":2}',
    });

    // Each tenant should only see their own prompt
    const t1Result = await promptService.getPromptBySlug(1, 1, "common-slug");
    const t2Result = await promptService.getPromptBySlug(2, 1, "common-slug");

    expect(t1Result?.id).toBe(t1Prompt.id);
    expect(t1Result?.name).toBe("Tenant 1 Version");
    expect(t1Result?.body).toBe('{"tenant":1}');

    expect(t2Result?.id).toBe(t2Prompt.id);
    expect(t2Result?.name).toBe("Tenant 2 Version");
    expect(t2Result?.body).toBe('{"tenant":2}');

    // Verify both exist in database
    const allPrompts = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE slug = ? ORDER BY tenantId"
    ).bind("common-slug").all<Prompt>();

    expect(allPrompts.results).toHaveLength(2);
  });

  it("should return prompt with all fields populated", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 5,
      name: "Full Prompt",
      slug: "full-prompt",
      provider: "google",
      model: "gemini-1.5-pro",
      body: '{"messages":[{"role":"user","content":"test"}]}',
    });

    const prompt = await promptService.getPromptBySlug(1, 5, "full-prompt");

    expect(prompt).toBeDefined();
    expect(prompt?.id).toBe(created.id);
    expect(prompt?.tenantId).toBe(1);
    expect(prompt?.projectId).toBe(5);
    expect(prompt?.name).toBe("Full Prompt");
    expect(prompt?.slug).toBe("full-prompt");
    expect(prompt?.provider).toBe("google");
    expect(prompt?.model).toBe("gemini-1.5-pro");
    expect(prompt?.body).toBe('{"messages":[{"role":"user","content":"test"}]}');
    expect(prompt?.latestVersion).toBe(1);
    expect(prompt?.isActive).toBe(true);
    expect(prompt?.createdAt).toBeInstanceOf(Date);
    expect(prompt?.updatedAt).toBeInstanceOf(Date);
  });
});
