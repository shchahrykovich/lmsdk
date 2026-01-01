import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { PromptVersion } from "../../../../worker/db/schema";

describe("PromptService - getPromptVersion", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return specific version of a prompt", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "V1",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    await promptService.updatePrompt(1, 1, created.id, { body: "v2" });
    await promptService.updatePrompt(1, 1, created.id, { body: "v3" });

    // Get version 1
    const v1 = await promptService.getPromptVersion(1, 1, created.id, 1);
    expect(v1).toBeDefined();
    expect(v1?.version).toBe(1);
    expect(v1?.body).toBe("v1");

    // Get version 2
    const v2 = await promptService.getPromptVersion(1, 1, created.id, 2);
    expect(v2).toBeDefined();
    expect(v2?.version).toBe(2);
    expect(v2?.body).toBe("v2");

    // Get version 3
    const v3 = await promptService.getPromptVersion(1, 1, created.id, 3);
    expect(v3).toBeDefined();
    expect(v3?.version).toBe(3);
    expect(v3?.body).toBe("v3");
  });

  it("should return undefined when version does not exist", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const result = await promptService.getPromptVersion(1, 1, created.id, 99);

    expect(result).toBeUndefined();
  });

  it("should return undefined when tenantId does not match (cross-tenant protection)", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Try to access with tenant 2
    const result = await promptService.getPromptVersion(2, 1, created.id, 1);

    expect(result).toBeUndefined();

    // Verify version exists in database
    const dbVersion = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? AND version = ?"
    ).bind(created.id, 1).first<PromptVersion>();

    expect(dbVersion).toBeDefined();
    expect(dbVersion?.tenantId).toBe(1);
  });

  it("should return undefined when projectId does not match (cross-project protection)", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Try to access with project 2
    const result = await promptService.getPromptVersion(1, 2, created.id, 1);

    expect(result).toBeUndefined();

    // Verify version exists in database
    const dbVersion = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? AND version = ?"
    ).bind(created.id, 1).first<PromptVersion>();

    expect(dbVersion).toBeDefined();
    expect(dbVersion?.projectId).toBe(1);
  });
});
