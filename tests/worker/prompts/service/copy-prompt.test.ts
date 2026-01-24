import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId } from "../../helpers/id-helpers";
import type { Prompt, PromptVersion, PromptRouter } from "../../../../worker/db/schema";

describe("PromptService - copyPrompt", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should copy a prompt with 'Copy' suffix", async () => {
    const projectId = createProjectId(1, 1);
    const originalPrompt = await promptService.createPrompt(projectId, {
      name: "Original Prompt",
      slug: "original-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"messages":[{"role":"system","content":"Test"}]}',
    });

    const entityId = createEntityId(originalPrompt.id, 1, 1);
    const copiedPrompt = await promptService.copyPrompt(entityId);

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

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(copiedPrompt.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    expect(dbPrompt?.name).toBe("Original Prompt Copy");
    expect(dbPrompt?.slug).toBe("original-prompt-copy");
    expect(dbPrompt?.isActive).toBe(1);
  });

  it("should copy a prompt with 'Copy 2' suffix when 'Copy' already exists", async () => {
    const projectId = createProjectId(1, 1);
    const originalPrompt = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(originalPrompt.id, 1, 1);

    const firstCopy = await promptService.copyPrompt(entityId);
    expect(firstCopy.name).toBe("Test Prompt Copy");
    expect(firstCopy.slug).toBe("test-prompt-copy");

    const secondCopy = await promptService.copyPrompt(entityId);
    expect(secondCopy.name).toBe("Test Prompt Copy 2");
    expect(secondCopy.slug).toBe("test-prompt-copy-2");
  });

  it("should copy a prompt with incremental numbers for multiple copies", async () => {
    const projectId = createProjectId(1, 1);
    const originalPrompt = await promptService.createPrompt(projectId, {
      name: "Multi Copy",
      slug: "multi-copy",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(originalPrompt.id, 1, 1);

    const copy1 = await promptService.copyPrompt(entityId);
    const copy2 = await promptService.copyPrompt(entityId);
    const copy3 = await promptService.copyPrompt(entityId);

    expect(copy1.name).toBe("Multi Copy Copy");
    expect(copy1.slug).toBe("multi-copy-copy");

    expect(copy2.name).toBe("Multi Copy Copy 2");
    expect(copy2.slug).toBe("multi-copy-copy-2");

    expect(copy3.name).toBe("Multi Copy Copy 3");
    expect(copy3.slug).toBe("multi-copy-copy-3");
  });

  it("should create version 1 for the copied prompt", async () => {
    const projectId = createProjectId(1, 1);
    const originalPrompt = await promptService.createPrompt(projectId, {
      name: "Source Prompt",
      slug: "source-prompt",
      provider: "anthropic",
      model: "claude-3-opus",
      body: '{"system":"Test system"}',
    });

    const entityId = createEntityId(originalPrompt.id, 1, 1);
    const copiedPrompt = await promptService.copyPrompt(entityId);

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
    const projectId = createProjectId(1, 1);
    const originalPrompt = await promptService.createPrompt(projectId, {
      name: "Router Test",
      slug: "router-test",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(originalPrompt.id, 1, 1);
    const copiedPrompt = await promptService.copyPrompt(entityId);

    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(copiedPrompt.id).first<PromptRouter>();

    expect(dbRouter).toBeDefined();
    expect(dbRouter?.version).toBe(1);
    expect(dbRouter?.tenantId).toBe(1);
    expect(dbRouter?.projectId).toBe(1);
  });

  it("should enforce cross-tenant protection - cannot copy prompt from different tenant", async () => {
    const tenant1Project = createProjectId(1, 1);
    const prompt = await promptService.createPrompt(tenant1Project, {
      name: "Tenant 1 Prompt",
      slug: "tenant-1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongTenantEntityId = createEntityId(prompt.id, 1, 2);

    await expect(
      promptService.copyPrompt(wrongTenantEntityId)
    ).rejects.toThrow("Source prompt not found");
  });

  it("should enforce cross-tenant protection - verify copied prompt is isolated to tenant", async () => {
    const tenant1Project = createProjectId(1, 1);
    const tenant2Project = createProjectId(1, 2);

    const prompt1 = await promptService.createPrompt(tenant1Project, {
      name: "Isolated Prompt",
      slug: "isolated-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });
    const entityId1 = createEntityId(prompt1.id, 1, 1);
    const copied1 = await promptService.copyPrompt(entityId1);

    const prompt2 = await promptService.createPrompt(tenant2Project, {
      name: "Isolated Prompt",
      slug: "isolated-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });
    const entityId2 = createEntityId(prompt2.id, 1, 2);
    const copied2 = await promptService.copyPrompt(entityId2);

    expect(copied1.tenantId).toBe(1);
    expect(copied2.tenantId).toBe(2);

    expect(copied1.name).toBe("Isolated Prompt Copy");
    expect(copied2.name).toBe("Isolated Prompt Copy");
    expect(copied1.slug).toBe("isolated-prompt-copy");
    expect(copied2.slug).toBe("isolated-prompt-copy");

    expect(copied1.id).not.toBe(copied2.id);
  });

  it("should fail when copying non-existent prompt", async () => {
    const entityId = createEntityId(99999, 1, 1);

    await expect(
      promptService.copyPrompt(entityId)
    ).rejects.toThrow("Source prompt not found");
  });

  it("should fail when copying prompt from different project", async () => {
    const project1 = createProjectId(1, 1);
    const prompt = await promptService.createPrompt(project1, {
      name: "Project 1 Prompt",
      slug: "project-1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongProjectEntityId = createEntityId(prompt.id, 2, 1);

    await expect(
      promptService.copyPrompt(wrongProjectEntityId)
    ).rejects.toThrow("Source prompt not found");
  });

  it("should copy all prompt configuration exactly", async () => {
    const projectId = createProjectId(1, 1);
    const originalPrompt = await promptService.createPrompt(projectId, {
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
    });

    const entityId = createEntityId(originalPrompt.id, 1, 1);
    const copiedPrompt = await promptService.copyPrompt(entityId);

    expect(copiedPrompt.provider).toBe(originalPrompt.provider);
    expect(copiedPrompt.model).toBe(originalPrompt.model);
    expect(copiedPrompt.body).toBe(originalPrompt.body);

    const originalBody = JSON.parse(originalPrompt.body);
    const copiedBody = JSON.parse(copiedPrompt.body);
    expect(copiedBody).toEqual(originalBody);
  });
});
