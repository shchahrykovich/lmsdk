import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - renamePrompt", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should rename a prompt successfully and auto-generate slug", async () => {
    // Create a prompt
    const input = {
      tenantId: 1,
      projectId: 1,
      name: "Original Name",
      slug: "original-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt = await promptService.createPrompt(input);

    // Rename the prompt (slug will be auto-generated from name)
    const renamedPrompt = await promptService.renamePrompt({
      tenantId: 1,
      projectId: 1,
      promptId: prompt.id,
      name: "New Name",
      slug: "ignored-slug", // This will be ignored
    });

    // Verify renamed prompt - slug should be auto-generated from "New Name" -> "new-name"
    expect(renamedPrompt.name).toBe("New Name");
    expect(renamedPrompt.slug).toBe("new-name");
    expect(renamedPrompt.id).toBe(prompt.id);
    expect(renamedPrompt.provider).toBe(prompt.provider);
    expect(renamedPrompt.model).toBe(prompt.model);
    expect(renamedPrompt.body).toBe(prompt.body);

    // Verify in database
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(prompt.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    expect(dbPrompt?.name).toBe("New Name");
    expect(dbPrompt?.slug).toBe("new-name");
  });

  it("should fail when renaming non-existent prompt", async () => {
    await expect(
      promptService.renamePrompt({
      tenantId: 1,
      projectId: 1,
      promptId: 99999,
      name: "New Name",
      slug: "ignored",
    })
    ).rejects.toThrow("Prompt not found");
  });

  it("should fail when auto-generated slug is already in use by another prompt", async () => {
    // Create two prompts
    const input1 = {
      tenantId: 1,
      projectId: 1,
      name: "Prompt 1",
      slug: "prompt-1",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const input2 = {
      tenantId: 1,
      projectId: 1,
      name: "Existing Prompt",
      slug: "existing-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt1 = await promptService.createPrompt(input1);
    await promptService.createPrompt(input2);

    // Try to rename prompt1 to "Existing Prompt" which will generate slug "existing-prompt"
    await expect(
      promptService.renamePrompt({
      tenantId: 1,
      projectId: 1,
      promptId: prompt1.id,
      name: "Existing Prompt",
      slug: "any-slug", // Ignored, will be auto-generated
    })
    ).rejects.toThrow("Slug already in use");
  });

  it("should allow renaming when auto-generated slug matches current slug", async () => {
    // Create a prompt
    const input = {
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt = await promptService.createPrompt(input);

    // Rename to name that generates the same slug
    const renamedPrompt = await promptService.renamePrompt({
      tenantId: 1,
      projectId: 1,
      promptId: prompt.id,
      name: "Test Prompt", // Generates same slug: "test-prompt"
      slug: "any-slug", // Ignored
    });

    expect(renamedPrompt.name).toBe("Test Prompt");
    expect(renamedPrompt.slug).toBe("test-prompt");
  });

  it("should enforce cross-tenant protection - cannot rename prompt from different tenant", async () => {
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

    // Try to rename as tenant 2
    await expect(
      promptService.renamePrompt({
      tenantId: 2,
      projectId: 1,
      promptId: prompt.id,
      name: "New Name",
      slug: "ignored",
    })
    ).rejects.toThrow("Prompt not found");
  });

  it("should enforce cross-tenant protection - verify slug collision check is tenant-scoped", async () => {
    // Create prompt for tenant 1
    const input1 = {
      tenantId: 1,
      projectId: 1,
      name: "Tenant 1 Prompt",
      slug: "shared-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    await promptService.createPrompt(input1);

    // Create prompt for tenant 2 with different slug
    const input2 = {
      tenantId: 2,
      projectId: 1,
      name: "Tenant 2 Prompt",
      slug: "tenant-2-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt2 = await promptService.createPrompt(input2);

    // Rename tenant 2's prompt to "Shared Slug" (auto-generates "shared-slug")
    const renamedPrompt = await promptService.renamePrompt({
      tenantId: 2,
      projectId: 1,
      promptId: prompt2.id,
      name: "Shared Slug",
      slug: "ignored",
    });

    expect(renamedPrompt.slug).toBe("shared-slug");
    expect(renamedPrompt.tenantId).toBe(2);

    // Verify both prompts exist with same slug but different tenants
    const tenant1Prompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE tenantId = 1 AND slug = 'shared-slug'"
    ).first<Prompt>();

    const tenant2Prompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE tenantId = 2 AND slug = 'shared-slug'"
    ).first<Prompt>();

    expect(tenant1Prompt).toBeDefined();
    expect(tenant2Prompt).toBeDefined();
    expect(tenant1Prompt?.id).not.toBe(tenant2Prompt?.id);
  });

  it("should fail when renaming prompt from different project", async () => {
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

    // Try to rename as project 2
    await expect(
      promptService.renamePrompt({
      tenantId: 1,
      projectId: 2,
      promptId: prompt.id,
      name: "New Name",
      slug: "ignored",
    })
    ).rejects.toThrow("Prompt not found");
  });

  it("should update updatedAt timestamp when renaming", async () => {
    // Create a prompt
    const input = {
      tenantId: 1,
      projectId: 1,
      name: "Original Name",
      slug: "original-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt = await promptService.createPrompt(input);
    const originalUpdatedAt = prompt.updatedAt;

    // Wait a moment to ensure timestamp changes
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Rename the prompt
    await promptService.renamePrompt({
      tenantId: 1,
      projectId: 1,
      promptId: prompt.id,
      name: "New Name",
      slug: "ignored",
    });

    // Verify updatedAt changed
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(prompt.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    // SQLite returns timestamps as numbers (Unix epochs in seconds)
    expect(dbPrompt?.updatedAt).toBeGreaterThan(originalUpdatedAt.getTime() / 1000);
  });

  it("should not affect prompt versions or router when renaming", async () => {
    // Create a prompt
    const input = {
      tenantId: 1,
      projectId: 1,
      name: "Original Name",
      slug: "original-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    };

    const prompt = await promptService.createPrompt(input);

    // Update to create version 2
    await promptService.updatePrompt(1, 1, prompt.id, {
      body: '{"test": "update"}',
    });

    // Get versions before rename
    const versionsBefore = await promptService.listPromptVersions(1, 1, prompt.id);
    const routerBefore = await promptService.getActiveRouterVersion(1, 1, prompt.id);

    // Rename the prompt
    await promptService.renamePrompt({
      tenantId: 1,
      projectId: 1,
      promptId: prompt.id,
      name: "New Name",
      slug: "ignored",
    });

    // Get versions after rename
    const versionsAfter = await promptService.listPromptVersions(1, 1, prompt.id);
    const routerAfter = await promptService.getActiveRouterVersion(1, 1, prompt.id);

    // Verify versions and router unchanged
    expect(versionsAfter.length).toBe(versionsBefore.length);
    expect(routerAfter).toBe(routerBefore);
  });

  it("should preserve all other prompt fields when renaming", async () => {
    // Create a prompt
    const input = {
      tenantId: 1,
      projectId: 1,
      name: "Original Name",
      slug: "original-slug",
      provider: "anthropic",
      model: "claude-3-opus",
      body: '{"messages":[{"role":"system","content":"Test"}]}',
    };

    const prompt = await promptService.createPrompt(input);

    // Rename the prompt
    const renamedPrompt = await promptService.renamePrompt({
      tenantId: 1,
      projectId: 1,
      promptId: prompt.id,
      name: "New Name",
      slug: "ignored",
    });

    // Verify all other fields unchanged
    expect(renamedPrompt.tenantId).toBe(prompt.tenantId);
    expect(renamedPrompt.projectId).toBe(prompt.projectId);
    expect(renamedPrompt.provider).toBe(prompt.provider);
    expect(renamedPrompt.model).toBe(prompt.model);
    expect(renamedPrompt.body).toBe(prompt.body);
    expect(renamedPrompt.latestVersion).toBe(prompt.latestVersion);
    expect(renamedPrompt.isActive).toBe(prompt.isActive);
    expect(renamedPrompt.createdAt.getTime()).toBe(prompt.createdAt.getTime());
  });
});
