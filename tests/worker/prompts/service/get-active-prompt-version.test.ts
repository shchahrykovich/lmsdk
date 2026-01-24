import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId } from "../../helpers/id-helpers";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - getActivePromptVersion", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return active version from router", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"v":1}',
    });

    const entityId = createEntityId(created.id, 1, 1);
    const activeVersion = await promptService.getActivePromptVersion(entityId);

    expect(activeVersion).toBeDefined();
    expect(activeVersion?.promptId).toBe(created.id);
    expect(activeVersion?.version).toBe(1);
    expect(activeVersion?.body).toBe('{"v":1}');
  });

  it("should return null when router does not exist", async () => {
    const entityId = createEntityId(99999, 1, 1);
    const activeVersion = await promptService.getActivePromptVersion(entityId);

    expect(activeVersion).toBeNull();
  });

  it("should return null when router exists but version does not exist", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await env.DB.prepare("DELETE FROM PromptVersions WHERE promptId = ?")
      .bind(created.id).run();

    const entityId = createEntityId(created.id, 1, 1);
    const activeVersion = await promptService.getActivePromptVersion(entityId);

    expect(activeVersion).toBeNull();
  });

  it("should return version specified by router, not latest version", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"v":1}',
    });

    const entityId = createEntityId(created.id, 1, 1);

    await promptService.updatePrompt(entityId, {
      body: '{"v":2}',
    });

    await promptService.updatePrompt(entityId, {
      body: '{"v":3}',
    });

    const activeV3 = await promptService.getActivePromptVersion(entityId);
    expect(activeV3?.version).toBe(3);
    expect(activeV3?.body).toBe('{"v":3}');

    await env.DB.prepare(
      "UPDATE PromptRouters SET version = ? WHERE promptId = ?"
    ).bind(2, created.id).run();

    const activeV2 = await promptService.getActivePromptVersion(entityId);
    expect(activeV2?.version).toBe(2);
    expect(activeV2?.body).toBe('{"v":2}');

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();
    expect(dbPrompt?.latestVersion).toBe(3);
  });

  it("should enforce cross-tenant protection", async () => {
    const projectId = createProjectId(1, 1);
    const t1Prompt = await promptService.createPrompt(projectId, {
      name: "T1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"tenant":1}',
    });

    const wrongTenantEntityId = createEntityId(t1Prompt.id, 1, 2);
    const activeVersion = await promptService.getActivePromptVersion(wrongTenantEntityId);

    expect(activeVersion).toBeNull();

    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(t1Prompt.id).first();

    expect(dbRouter).toBeDefined();
  });

  it("should enforce cross-project protection", async () => {
    const projectId = createProjectId(1, 1);
    const p1Prompt = await promptService.createPrompt(projectId, {
      name: "P1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"project":1}',
    });

    const wrongProjectEntityId = createEntityId(p1Prompt.id, 2, 1);
    const activeVersion = await promptService.getActivePromptVersion(wrongProjectEntityId);

    expect(activeVersion).toBeNull();

    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(p1Prompt.id).first();

    expect(dbRouter).toBeDefined();
  });

  it("should return version with all fields populated", async () => {
    const projectId = createProjectId(5, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Full Prompt",
      slug: "full-prompt",
      provider: "google",
      model: "gemini-1.5-pro",
      body: '{"messages":[{"role":"user","content":"test"}]}',
    });

    const entityId = createEntityId(created.id, 5, 1);
    const activeVersion = await promptService.getActivePromptVersion(entityId);

    expect(activeVersion).toBeDefined();
    expect(activeVersion?.id).toBeDefined();
    expect(activeVersion?.promptId).toBe(created.id);
    expect(activeVersion?.tenantId).toBe(1);
    expect(activeVersion?.projectId).toBe(5);
    expect(activeVersion?.version).toBe(1);
    expect(activeVersion?.name).toBe("Full Prompt");
    expect(activeVersion?.slug).toBe("full-prompt");
    expect(activeVersion?.provider).toBe("google");
    expect(activeVersion?.model).toBe("gemini-1.5-pro");
    expect(activeVersion?.body).toBe('{"messages":[{"role":"user","content":"test"}]}');
    expect(activeVersion?.createdAt).toBeInstanceOf(Date);
  });

  it("should handle multiple prompts with different active versions", async () => {
    const projectId = createProjectId(1, 1);

    const p1 = await promptService.createPrompt(projectId, {
      name: "Prompt 1",
      slug: "prompt-1",
      provider: "openai",
      model: "gpt-4",
      body: '{"p":1,"v":1}',
    });

    const entityId1 = createEntityId(p1.id, 1, 1);
    await promptService.updatePrompt(entityId1, { body: '{"p":1,"v":2}' });
    await promptService.updatePrompt(entityId1, { body: '{"p":1,"v":3}' });
    await env.DB.prepare(
      "UPDATE PromptRouters SET version = ? WHERE promptId = ?"
    ).bind(2, p1.id).run();

    const p2 = await promptService.createPrompt(projectId, {
      name: "Prompt 2",
      slug: "prompt-2",
      provider: "openai",
      model: "gpt-4",
      body: '{"p":2,"v":1}',
    });

    const entityId2 = createEntityId(p2.id, 1, 1);
    await promptService.updatePrompt(entityId2, { body: '{"p":2,"v":2}' });
    await env.DB.prepare(
      "UPDATE PromptRouters SET version = ? WHERE promptId = ?"
    ).bind(1, p2.id).run();

    const p1Active = await promptService.getActivePromptVersion(entityId1);
    const p2Active = await promptService.getActivePromptVersion(entityId2);

    expect(p1Active?.version).toBe(2);
    expect(p1Active?.body).toBe('{"p":1,"v":2}');

    expect(p2Active?.version).toBe(1);
    expect(p2Active?.body).toBe('{"p":2,"v":1}');
  });
});
