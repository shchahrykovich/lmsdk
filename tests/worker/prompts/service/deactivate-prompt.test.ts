import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId } from "../../helpers/id-helpers";

describe("PromptService - deactivatePrompt", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should deactivate prompt when IDs match", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    expect(created.isActive).toBe(true);

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.deactivatePrompt(entityId);

    const dbPrompt = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    ).bind(created.id).first<{ isActive: number }>();

    expect(dbPrompt?.isActive).toBe(0);
  });

  it("should not deactivate prompt when tenantId does not match (cross-tenant protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Tenant 1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    expect(created.isActive).toBe(true);

    const wrongTenantEntityId = createEntityId(created.id, 1, 2);
    await promptService.deactivatePrompt(wrongTenantEntityId);

    const dbPrompt = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    ).bind(created.id).first<{ isActive: number }>();

    expect(dbPrompt?.isActive).toBe(1);
  });

  it("should not deactivate prompt when projectId does not match (cross-project protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Project 1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    expect(created.isActive).toBe(true);

    const wrongProjectEntityId = createEntityId(created.id, 2, 1);
    await promptService.deactivatePrompt(wrongProjectEntityId);

    const dbPrompt = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    ).bind(created.id).first<{ isActive: number }>();

    expect(dbPrompt?.isActive).toBe(1);
  });
});
