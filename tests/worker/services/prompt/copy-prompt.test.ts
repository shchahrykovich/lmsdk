import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt, PromptVersion, PromptRouter } from "../../../../worker/db/schema";

describe("PromptService - copyPrompt", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should copy a prompt with 'Copy' suffix", async () => {
    // Create original prompt
    const originalInput = {
      tenantId: 1,
      projectId: 1,
      name: "Original Prompt",
      slug: "original-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"messages":[{"role":"system","content":"Test"}]}',
    };

    const originalPrompt = await promptService.createPrompt(originalInput);

    // Copy the prompt
    const copiedPrompt = await promptService.copyPrompt(1, 1, originalPrompt.id);

    // Verify copied prompt has correct name and slug
    expect(copiedPrompt).toBeDefined();
    expect(copiedPrompt.id).not.toBe(originalPrompt.id);
    expect(copiedPrompt.name).toBe("Original Prompt Copy");
    expect(copiedPrompt.slug).toBe("original-prompt-copy");
    expect(copiedPrompt.provider).toBe(originalPrompt.provider);
    expect(copiedPrompt.model).toBe(originalPrompt.model);
    expect(copiedPrompt.body).toBe(originalPrompt.body);
    expect(copiedPrompt.latestVersion).toBe(1);
    expect(copiedPrompt.isActive).toBe(true);
    expect(copiedPrompt.tenantId).toBe(1);
    expect(copiedPrompt.projectId).toBe(1);

    // Verify in database
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(copiedPrompt.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    expect(dbPrompt?.name).toBe("Original Prompt Copy");
    expect(dbPrompt?.slug).toBe("original-prompt-copy");
    expect(dbPrompt?.isActive).toBe(1);
  });

  it("should copy a prompt with 'Copy 2' suffix when 'Copy' already exists", async () => {
    // Create original prompt
    const originalInput = {
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const originalPrompt = await promptService.createPrompt(originalInput);

    // First copy
    const firstCopy = await promptService.copyPrompt(1, 1, originalPrompt.id);
    expect(firstCopy.name).toBe("Test Prompt Copy");
    expect(firstCopy.slug).toBe("test-prompt-copy");

    // Second copy
    const secondCopy = await promptService.copyPrompt(1, 1, originalPrompt.id);
    expect(secondCopy.name).toBe("Test Prompt Copy 2");
    expect(secondCopy.slug).toBe("test-prompt-copy-2");
  });

  it("should copy a prompt with incremental numbers for multiple copies", async () => {
    // Create original prompt
    const originalInput = {
      tenantId: 1,
      projectId: 1,
      name: "Multi Copy",
      slug: "multi-copy",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const originalPrompt = await promptService.createPrompt(originalInput);

    // Create multiple copies
    const copy1 = await promptService.copyPrompt(1, 1, originalPrompt.id);
    const copy2 = await promptService.copyPrompt(1, 1, originalPrompt.id);
    const copy3 = await promptService.copyPrompt(1, 1, originalPrompt.id);

    expect(copy1.name).toBe("Multi Copy Copy");
    expect(copy1.slug).toBe("multi-copy-copy");

    expect(copy2.name).toBe("Multi Copy Copy 2");
    expect(copy2.slug).toBe("multi-copy-copy-2");

    expect(copy3.name).toBe("Multi Copy Copy 3");
    expect(copy3.slug).toBe("multi-copy-copy-3");
  });

  it("should create version 1 for the copied prompt", async () => {
    // Create original prompt
    const originalInput = {
      tenantId: 1,
      projectId: 1,
      name: "Source Prompt",
      slug: "source-prompt",
      provider: "anthropic",
      model: "claude-3-opus",
      body: '{"system":"Test system"}',
    };

    const originalPrompt = await promptService.createPrompt(originalInput);
    const copiedPrompt = await promptService.copyPrompt(1, 1, originalPrompt.id);

    // Verify version was created
    const dbVersion = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? AND version = ?"
    ).bind(copiedPrompt.id, 1).first<PromptVersion>();

    expect(dbVersion).toBeDefined();
    expect(dbVersion?.name).toBe("Source Prompt Copy");
    expect(dbVersion?.provider).toBe("anthropic");
    expect(dbVersion?.model).toBe("claude-3-opus");
    expect(dbVersion?.body).toBe('{"system":"Test system"}');
    expect(dbVersion?.slug).toBe("source-prompt-copy");
    expect(dbVersion?.tenantId).toBe(1);
    expect(dbVersion?.projectId).toBe(1);
  });

  it("should create router pointing to version 1 for the copied prompt", async () => {
    // Create original prompt
    const originalInput = {
      tenantId: 1,
      projectId: 1,
      name: "Router Test",
      slug: "router-test",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const originalPrompt = await promptService.createPrompt(originalInput);
    const copiedPrompt = await promptService.copyPrompt(1, 1, originalPrompt.id);

    // Verify router was created
    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(copiedPrompt.id).first<PromptRouter>();

    expect(dbRouter).toBeDefined();
    expect(dbRouter?.version).toBe(1);
    expect(dbRouter?.tenantId).toBe(1);
    expect(dbRouter?.projectId).toBe(1);
  });

  it("should enforce cross-tenant protection - cannot copy prompt from different tenant", async () => {
    // Create prompt for tenant 1
    const input = {
      tenantId: 1,
      projectId: 1,
      name: "Tenant 1 Prompt",
      slug: "tenant-1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt = await promptService.createPrompt(input);

    // Try to copy as tenant 2
    await expect(
      promptService.copyPrompt(2, 1, prompt.id)
    ).rejects.toThrow("Source prompt not found");
  });

  it("should enforce cross-tenant protection - verify copied prompt is isolated to tenant", async () => {
    // Create prompt for tenant 1
    const input1 = {
      tenantId: 1,
      projectId: 1,
      name: "Isolated Prompt",
      slug: "isolated-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt1 = await promptService.createPrompt(input1);
    const copied1 = await promptService.copyPrompt(1, 1, prompt1.id);

    // Create prompt for tenant 2
    const input2 = {
      tenantId: 2,
      projectId: 1,
      name: "Isolated Prompt",
      slug: "isolated-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt2 = await promptService.createPrompt(input2);
    const copied2 = await promptService.copyPrompt(2, 1, prompt2.id);

    // Verify isolation
    expect(copied1.tenantId).toBe(1);
    expect(copied2.tenantId).toBe(2);

    // Verify both have same name/slug (allowed across tenants)
    expect(copied1.name).toBe("Isolated Prompt Copy");
    expect(copied2.name).toBe("Isolated Prompt Copy");
    expect(copied1.slug).toBe("isolated-prompt-copy");
    expect(copied2.slug).toBe("isolated-prompt-copy");

    // Verify they are different records
    expect(copied1.id).not.toBe(copied2.id);
  });

  it("should fail when copying non-existent prompt", async () => {
    await expect(
      promptService.copyPrompt(1, 1, 99999)
    ).rejects.toThrow("Source prompt not found");
  });

  it("should fail when copying prompt from different project", async () => {
    // Create prompt in project 1
    const input = {
      tenantId: 1,
      projectId: 1,
      name: "Project 1 Prompt",
      slug: "project-1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt = await promptService.createPrompt(input);

    // Try to copy as project 2
    await expect(
      promptService.copyPrompt(1, 2, prompt.id)
    ).rejects.toThrow("Source prompt not found");
  });

  it("should copy all prompt configuration exactly", async () => {
    // Create a complex prompt
    const complexInput = {
      tenantId: 1,
      projectId: 1,
      name: "Complex Prompt",
      slug: "complex-prompt",
      provider: "anthropic",
      model: "claude-3-sonnet",
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hello {{name}}" }
        ],
        temperature: 0.7,
        max_tokens: 1000
      }),
    };

    const originalPrompt = await promptService.createPrompt(complexInput);
    const copiedPrompt = await promptService.copyPrompt(1, 1, originalPrompt.id);

    // Verify all configuration is copied exactly
    expect(copiedPrompt.provider).toBe(originalPrompt.provider);
    expect(copiedPrompt.model).toBe(originalPrompt.model);
    expect(copiedPrompt.body).toBe(originalPrompt.body);

    // Verify parsed body matches
    const originalBody = JSON.parse(originalPrompt.body);
    const copiedBody = JSON.parse(copiedPrompt.body);
    expect(copiedBody).toEqual(originalBody);
  });
});
