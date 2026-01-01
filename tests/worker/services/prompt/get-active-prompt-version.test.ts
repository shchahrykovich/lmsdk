import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - getActivePromptVersion", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return active version from router", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"v":1}',
    });

    const activeVersion = await promptService.getActivePromptVersion(1, 1, created.id);

    expect(activeVersion).toBeDefined();
    expect(activeVersion?.promptId).toBe(created.id);
    expect(activeVersion?.version).toBe(1);
    expect(activeVersion?.body).toBe('{"v":1}');
  });

  it("should return null when router does not exist", async () => {
    const activeVersion = await promptService.getActivePromptVersion(1, 1, 99999);

    expect(activeVersion).toBeNull();
  });

  it("should return null when router exists but version does not exist", async () => {
    // Create a prompt
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Manually delete the version (corrupted state)
    await env.DB.prepare("DELETE FROM PromptVersions WHERE promptId = ?")
      .bind(created.id).run();

    const activeVersion = await promptService.getActivePromptVersion(1, 1, created.id);

    expect(activeVersion).toBeNull();
  });

  it("should return version specified by router, not latest version", async () => {
    // Create prompt with version 1
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"v":1}',
    });

    // Update to create version 2
    await promptService.updatePrompt(1, 1, created.id, {
      body: '{"v":2}',
    });

    // Update to create version 3
    await promptService.updatePrompt(1, 1, created.id, {
      body: '{"v":3}',
    });

    // Router should now point to version 3
    const activeV3 = await promptService.getActivePromptVersion(1, 1, created.id);
    expect(activeV3?.version).toBe(3);
    expect(activeV3?.body).toBe('{"v":3}');

    // Manually update router to point to version 2
    await env.DB.prepare(
      "UPDATE PromptRouters SET version = ? WHERE promptId = ?"
    ).bind(2, created.id).run();

    // Now active version should be 2, even though latest is 3
    const activeV2 = await promptService.getActivePromptVersion(1, 1, created.id);
    expect(activeV2?.version).toBe(2);
    expect(activeV2?.body).toBe('{"v":2}');

    // Verify prompt still has latestVersion = 3
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();
    expect(dbPrompt?.latestVersion).toBe(3);
  });

  it("should enforce cross-tenant protection", async () => {
    // Create prompt for tenant 1
    const t1Prompt = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "T1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"tenant":1}',
    });

    // Try to get active version with different tenant
    const activeVersion = await promptService.getActivePromptVersion(2, 1, t1Prompt.id);

    expect(activeVersion).toBeNull();

    // Verify router exists in database but was filtered
    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(t1Prompt.id).first();

    expect(dbRouter).toBeDefined();
  });

  it("should enforce cross-project protection", async () => {
    // Create prompt for project 1
    const p1Prompt = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "P1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"project":1}',
    });

    // Try to get active version with different project
    const activeVersion = await promptService.getActivePromptVersion(1, 2, p1Prompt.id);

    expect(activeVersion).toBeNull();

    // Verify router exists in database but was filtered
    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(p1Prompt.id).first();

    expect(dbRouter).toBeDefined();
  });

  it("should return version with all fields populated", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 5,
      name: "Full Prompt",
      slug: "full-prompt",
      provider: "google",
      model: "gemini-1.5-pro",
      body: '{"messages":[{"role":"user","content":"test"}]}',
    });

    const activeVersion = await promptService.getActivePromptVersion(1, 5, created.id);

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
    // Create prompt 1 with 3 versions, router points to v2
    const p1 = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Prompt 1",
      slug: "prompt-1",
      provider: "openai",
      model: "gpt-4",
      body: '{"p":1,"v":1}',
    });
    await promptService.updatePrompt(1, 1, p1.id, { body: '{"p":1,"v":2}' });
    await promptService.updatePrompt(1, 1, p1.id, { body: '{"p":1,"v":3}' });
    await env.DB.prepare(
      "UPDATE PromptRouters SET version = ? WHERE promptId = ?"
    ).bind(2, p1.id).run();

    // Create prompt 2 with 2 versions, router points to v1
    const p2 = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Prompt 2",
      slug: "prompt-2",
      provider: "openai",
      model: "gpt-4",
      body: '{"p":2,"v":1}',
    });
    await promptService.updatePrompt(1, 1, p2.id, { body: '{"p":2,"v":2}' });
    await env.DB.prepare(
      "UPDATE PromptRouters SET version = ? WHERE promptId = ?"
    ).bind(1, p2.id).run();

    // Get active versions
    const p1Active = await promptService.getActivePromptVersion(1, 1, p1.id);
    const p2Active = await promptService.getActivePromptVersion(1, 1, p2.id);

    expect(p1Active?.version).toBe(2);
    expect(p1Active?.body).toBe('{"p":1,"v":2}');

    expect(p2Active?.version).toBe(1);
    expect(p2Active?.body).toBe('{"p":2,"v":1}');
  });
});
