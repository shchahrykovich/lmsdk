import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId } from "../../helpers/id-helpers";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - getPromptBySlug", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return prompt when slug and tenantId match", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const prompt = await promptService.getPromptBySlug(projectId, "test-prompt");

    expect(prompt).toBeDefined();
    expect(prompt?.id).toBe(created.id);
    expect(prompt?.slug).toBe("test-prompt");
    expect(prompt?.name).toBe("Test Prompt");
    expect(prompt?.tenantId).toBe(1);
    expect(prompt?.projectId).toBe(1);
  });

  it("should return undefined when slug does not exist", async () => {
    const projectId = createProjectId(1, 1);
    const prompt = await promptService.getPromptBySlug(projectId, "non-existent");

    expect(prompt).toBeUndefined();
  });

  it("should return undefined when slug exists but tenantId does not match (cross-tenant protection)", async () => {
    const tenant1Project = createProjectId(1, 1);
    await promptService.createPrompt(tenant1Project, {
      name: "Tenant 1 Prompt",
      slug: "shared-slug",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const tenant2Project = createProjectId(1, 2);
    const prompt = await promptService.getPromptBySlug(tenant2Project, "shared-slug");

    expect(prompt).toBeUndefined();

    const dbResult = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE slug = ?"
    ).bind("shared-slug").first<Prompt>();

    expect(dbResult?.tenantId).toBe(1);
  });

  it("should return undefined when slug exists but projectId does not match (cross-project protection)", async () => {
    const project1 = createProjectId(1, 1);
    await promptService.createPrompt(project1, {
      name: "Project 1 Prompt",
      slug: "project-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const project2 = createProjectId(2, 1);
    const prompt = await promptService.getPromptBySlug(project2, "project-prompt");

    expect(prompt).toBeUndefined();

    const dbResult = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE slug = ?"
    ).bind("project-prompt").first<Prompt>();

    expect(dbResult?.projectId).toBe(1);
  });

  it("should handle same slug across different tenants correctly", async () => {
    const tenant1Project = createProjectId(1, 1);
    const tenant2Project = createProjectId(1, 2);

    const t1Prompt = await promptService.createPrompt(tenant1Project, {
      name: "Tenant 1 Version",
      slug: "common-slug",
      provider: "openai",
      model: "gpt-4",
      body: '{"tenant":1}',
    });

    const t2Prompt = await promptService.createPrompt(tenant2Project, {
      name: "Tenant 2 Version",
      slug: "common-slug",
      provider: "openai",
      model: "gpt-4",
      body: '{"tenant":2}',
    });

    const t1Result = await promptService.getPromptBySlug(tenant1Project, "common-slug");
    const t2Result = await promptService.getPromptBySlug(tenant2Project, "common-slug");

    expect(t1Result?.id).toBe(t1Prompt.id);
    expect(t1Result?.name).toBe("Tenant 1 Version");
    expect(t1Result?.body).toBe('{"tenant":1}');

    expect(t2Result?.id).toBe(t2Prompt.id);
    expect(t2Result?.name).toBe("Tenant 2 Version");
    expect(t2Result?.body).toBe('{"tenant":2}');

    const allPrompts = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE slug = ? ORDER BY tenantId"
    ).bind("common-slug").all<Prompt>();

    expect(allPrompts.results).toHaveLength(2);
  });

  it("should return prompt with all fields populated", async () => {
    const projectId = createProjectId(5, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Full Prompt",
      slug: "full-prompt",
      provider: "google",
      model: "gemini-1.5-pro",
      body: '{"messages":[{"role":"user","content":"test"}]}',
    });

    const prompt = await promptService.getPromptBySlug(projectId, "full-prompt");

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
