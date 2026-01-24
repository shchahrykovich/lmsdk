import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId } from "../../helpers/id-helpers";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - renamePrompt", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should rename a prompt successfully and auto-generate slug", async () => {
    const projectId = createProjectId(1, 1);
    const prompt = await promptService.createPrompt(projectId, {
      name: "Original Name",
      slug: "original-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(prompt.id, 1, 1);
    const renamedPrompt = await promptService.renamePrompt(entityId, "New Name");

    expect(renamedPrompt.name).toBe("New Name");
    expect(renamedPrompt.slug).toBe("new-name");
    expect(renamedPrompt.id).toBe(prompt.id);
    expect(renamedPrompt.provider).toBe(prompt.provider);
    expect(renamedPrompt.model).toBe(prompt.model);
    expect(renamedPrompt.body).toBe(prompt.body);

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(prompt.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    expect(dbPrompt?.name).toBe("New Name");
    expect(dbPrompt?.slug).toBe("new-name");
  });

  it("should fail when renaming non-existent prompt", async () => {
    const entityId = createEntityId(99999, 1, 1);

    await expect(
      promptService.renamePrompt(entityId, "New Name")
    ).rejects.toThrow("Prompt not found");
  });

  it("should fail when auto-generated slug is already in use by another prompt", async () => {
    const projectId = createProjectId(1, 1);

    const prompt1 = await promptService.createPrompt(projectId, {
      name: "Prompt 1",
      slug: "prompt-1",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await promptService.createPrompt(projectId, {
      name: "Existing Prompt",
      slug: "existing-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(prompt1.id, 1, 1);

    await expect(
      promptService.renamePrompt(entityId, "Existing Prompt")
    ).rejects.toThrow("Slug already in use");
  });

  it("should allow renaming when auto-generated slug matches current slug", async () => {
    const projectId = createProjectId(1, 1);
    const prompt = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(prompt.id, 1, 1);
    const renamedPrompt = await promptService.renamePrompt(entityId, "Test Prompt");

    expect(renamedPrompt.name).toBe("Test Prompt");
    expect(renamedPrompt.slug).toBe("test-prompt");
  });

  it("should enforce cross-tenant protection - cannot rename prompt from different tenant", async () => {
    const projectId = createProjectId(1, 1);
    const prompt = await promptService.createPrompt(projectId, {
      name: "Tenant 1 Prompt",
      slug: "tenant-1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongTenantEntityId = createEntityId(prompt.id, 1, 2);

    await expect(
      promptService.renamePrompt(wrongTenantEntityId, "New Name")
    ).rejects.toThrow("Prompt not found");
  });

  it("should enforce cross-tenant protection - verify slug collision check is tenant-scoped", async () => {
    const tenant1Project = createProjectId(1, 1);
    const tenant2Project = createProjectId(1, 2);

    await promptService.createPrompt(tenant1Project, {
      name: "Tenant 1 Prompt",
      slug: "shared-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const prompt2 = await promptService.createPrompt(tenant2Project, {
      name: "Tenant 2 Prompt",
      slug: "tenant-2-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(prompt2.id, 1, 2);
    const renamedPrompt = await promptService.renamePrompt(entityId, "Shared Slug");

    expect(renamedPrompt.slug).toBe("shared-slug");
    expect(renamedPrompt.tenantId).toBe(2);

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
    const projectId = createProjectId(1, 1);
    const prompt = await promptService.createPrompt(projectId, {
      name: "Project 1 Prompt",
      slug: "project-1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongProjectEntityId = createEntityId(prompt.id, 2, 1);

    await expect(
      promptService.renamePrompt(wrongProjectEntityId, "New Name")
    ).rejects.toThrow("Prompt not found");
  });

  it("should update updatedAt timestamp when renaming", async () => {
    const projectId = createProjectId(1, 1);
    const prompt = await promptService.createPrompt(projectId, {
      name: "Original Name",
      slug: "original-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const originalUpdatedAt = prompt.updatedAt;

    await new Promise(resolve => setTimeout(resolve, 1100));

    const entityId = createEntityId(prompt.id, 1, 1);
    await promptService.renamePrompt(entityId, "New Name");

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(prompt.id).first<Prompt>();

    expect(dbPrompt).toBeDefined();
    expect(dbPrompt?.updatedAt).toBeGreaterThan(originalUpdatedAt.getTime() / 1000);
  });

  it("should not affect prompt versions or router when renaming", async () => {
    const projectId = createProjectId(1, 1);
    const prompt = await promptService.createPrompt(projectId, {
      name: "Original Name",
      slug: "original-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(prompt.id, 1, 1);
    await promptService.updatePrompt(entityId, {
      body: '{"test": "update"}',
    });

    const versionsBefore = await promptService.listPromptVersions(entityId);
    const routerBefore = await promptService.getActiveRouterVersion(entityId);

    await promptService.renamePrompt(entityId, "New Name");

    const versionsAfter = await promptService.listPromptVersions(entityId);
    const routerAfter = await promptService.getActiveRouterVersion(entityId);

    expect(versionsAfter.length).toBe(versionsBefore.length);
    expect(routerAfter).toBe(routerBefore);
  });

  it("should preserve all other prompt fields when renaming", async () => {
    const projectId = createProjectId(1, 1);
    const prompt = await promptService.createPrompt(projectId, {
      name: "Original Name",
      slug: "original-slug",
      provider: "anthropic",
      model: "claude-3-opus",
      body: '{"messages":[{"role":"system","content":"Test"}]}',
    });

    const entityId = createEntityId(prompt.id, 1, 1);
    const renamedPrompt = await promptService.renamePrompt(entityId, "New Name");

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
