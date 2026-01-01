import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt, PromptVersion, PromptRouter } from "../../../../worker/db/schema";

describe("PromptService - updatePrompt", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should increment version and update prompt data", async () => {
    // Create initial prompt
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Original Name",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"original":true}',
    });

    expect(created.latestVersion).toBe(1);

    // Update the prompt
    await promptService.updatePrompt(1, 1, created.id, {
      name: "Updated Name",
      model: "gpt-4-turbo",
      body: '{"updated":true}',
    });

    // Verify prompt was updated
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt?.name).toBe("Updated Name");
    expect(dbPrompt?.model).toBe("gpt-4-turbo");
    expect(dbPrompt?.body).toBe('{"updated":true}');
    expect(dbPrompt?.provider).toBe("openai"); // Unchanged
    expect(dbPrompt?.latestVersion).toBe(2);

    // Verify version 2 was created
    const dbVersion2 = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? AND version = ?"
    ).bind(created.id, 2).first<PromptVersion>();

    expect(dbVersion2).toBeDefined();
    expect(dbVersion2?.name).toBe("Updated Name");
    expect(dbVersion2?.model).toBe("gpt-4-turbo");
    expect(dbVersion2?.body).toBe('{"updated":true}');
    expect(dbVersion2?.provider).toBe("openai");

    // Verify version 1 still exists (immutable)
    const dbVersion1 = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? AND version = ?"
    ).bind(created.id, 1).first<PromptVersion>();

    expect(dbVersion1).toBeDefined();
    expect(dbVersion1?.name).toBe("Original Name");
    expect(dbVersion1?.body).toBe('{"original":true}');

    // Verify router was updated to version 2
    const dbRouter = await env.DB.prepare(
      "SELECT * FROM PromptRouters WHERE promptId = ?"
    ).bind(created.id).first<PromptRouter>();

    expect(dbRouter?.version).toBe(2);
  });

  it("should preserve unchanged fields during partial update", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: '{"test":true}',
    });

    // Update only the name
    await promptService.updatePrompt(1, 1, created.id, {
      name: "New Name Only",
    });

    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt?.name).toBe("New Name Only");
    expect(dbPrompt?.provider).toBe("openai"); // Unchanged
    expect(dbPrompt?.model).toBe("gpt-4"); // Unchanged
    expect(dbPrompt?.body).toBe('{"test":true}'); // Unchanged
    expect(dbPrompt?.latestVersion).toBe(2);
  });

  it("should fail when updating non-existent prompt", async () => {
    await expect(
      promptService.updatePrompt(1, 1, 99999, { name: "New Name" })
    ).rejects.toThrow("Prompt not found");
  });

  it("should not update prompt when tenantId does not match (cross-tenant protection)", async () => {
    // Create prompt for tenant 1
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Tenant 1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Try to update with tenant 2 (should fail)
    await expect(
      promptService.updatePrompt(2, 1, created.id, { name: "Hacked Name" })
    ).rejects.toThrow("Prompt not found");

    // Verify prompt was not modified
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt?.name).toBe("Tenant 1 Prompt");
    expect(dbPrompt?.latestVersion).toBe(1);
  });

  it("should not update prompt when projectId does not match (cross-project protection)", async () => {
    // Create prompt for project 1
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Project 1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Try to update with project 2 (should fail)
    await expect(
      promptService.updatePrompt(1, 2, created.id, { name: "Hacked Name" })
    ).rejects.toThrow("Prompt not found");

    // Verify prompt was not modified
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt?.name).toBe("Project 1 Prompt");
    expect(dbPrompt?.latestVersion).toBe(1);
  });

  it("should create multiple versions correctly", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "V1",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    // Create version 2
    await promptService.updatePrompt(1, 1, created.id, { body: "v2" });

    // Create version 3
    await promptService.updatePrompt(1, 1, created.id, { body: "v3" });

    // Create version 4
    await promptService.updatePrompt(1, 1, created.id, { body: "v4" });

    // Verify latest version is 4
    const dbPrompt = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(created.id).first<Prompt>();

    expect(dbPrompt?.latestVersion).toBe(4);
    expect(dbPrompt?.body).toBe("v4");

    // Verify all 4 versions exist
    const allVersions = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? ORDER BY version"
    ).bind(created.id).all<PromptVersion>();

    expect(allVersions.results).toHaveLength(4);
    expect(allVersions.results[0].body).toBe("v1");
    expect(allVersions.results[1].body).toBe("v2");
    expect(allVersions.results[2].body).toBe("v3");
    expect(allVersions.results[3].body).toBe("v4");
  });
});
