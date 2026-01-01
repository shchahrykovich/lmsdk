import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - listPromptVersions", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return all versions ordered by version DESC", async () => {
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
    await promptService.updatePrompt(1, 1, created.id, { body: "v4" });

    const versions = await promptService.listPromptVersions(1, 1, created.id);

    expect(versions).toHaveLength(4);
    // Should be ordered DESC (newest first)
    expect(versions[0].version).toBe(4);
    expect(versions[1].version).toBe(3);
    expect(versions[2].version).toBe(2);
    expect(versions[3].version).toBe(1);
  });

  it("should return empty array when no versions exist", async () => {
    const versions = await promptService.listPromptVersions(1, 1, 99999);

    expect(versions).toEqual([]);
  });

  it("should only return versions for the specified tenant (cross-tenant protection)", async () => {
    // Create prompt for tenant 1
    const t1Prompt = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "T1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "t1",
    });

    await promptService.updatePrompt(1, 1, t1Prompt.id, { body: "t1-v2" });

    // Create prompt for tenant 2
    const t2Prompt = await promptService.createPrompt({
      tenantId: 2,
      projectId: 1,
      name: "T2 Prompt",
      slug: "t2-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "t2",
    });

    await promptService.updatePrompt(2, 1, t2Prompt.id, { body: "t2-v2" });

    // List versions for tenant 1
    const t1Versions = await promptService.listPromptVersions(1, 1, t1Prompt.id);
    expect(t1Versions).toHaveLength(2);
    expect(t1Versions.every(v => v.tenantId === 1)).toBe(true);

    // Try to list tenant 1's versions from tenant 2 (should get empty)
    const wrongTenantVersions = await promptService.listPromptVersions(2, 1, t1Prompt.id);
    expect(wrongTenantVersions).toEqual([]);

    // Verify versions exist in database
    const dbVersions = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM PromptVersions WHERE promptId = ?"
    ).bind(t1Prompt.id).first<{ count: number }>();

    expect(dbVersions?.count).toBe(2);
  });

  it("should only return versions for the specified project (cross-project protection)", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await promptService.updatePrompt(1, 1, created.id, { body: "v2" });

    // Try to list from wrong project
    const wrongProjectVersions = await promptService.listPromptVersions(1, 2, created.id);
    expect(wrongProjectVersions).toEqual([]);

    // Correct project should see versions
    const correctVersions = await promptService.listPromptVersions(1, 1, created.id);
    expect(correctVersions).toHaveLength(2);
  });
});
