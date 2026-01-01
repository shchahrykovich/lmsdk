import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt, PromptVersion } from "../../../../worker/db/schema";

describe("PromptService - Cross-tenant and cross-project protection comprehensive tests", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should prevent any cross-tenant data leakage across all operations", async () => {
    // Setup: Create prompts for multiple tenants
    const tenant1Prompts = [
      await promptService.createPrompt({
        tenantId: 1,
        projectId: 1,
        name: "T1 Prompt A",
        slug: "t1-a",
        provider: "openai",
        model: "gpt-4",
        body: "t1a",
      }),
      await promptService.createPrompt({
        tenantId: 1,
        projectId: 1,
        name: "T1 Prompt B",
        slug: "t1-b",
        provider: "openai",
        model: "gpt-4",
        body: "t1b",
      }),
    ];

    const tenant2Prompts = [
      await promptService.createPrompt({
        tenantId: 2,
        projectId: 1,
        name: "T2 Prompt A",
        slug: "t2-a",
        provider: "openai",
        model: "gpt-4",
        body: "t2a",
      }),
      await promptService.createPrompt({
        tenantId: 2,
        projectId: 1,
        name: "T2 Prompt B",
        slug: "t2-b",
        provider: "openai",
        model: "gpt-4",
        body: "t2b",
      }),
    ];

    // Test 1: List operation isolates tenants
    const tenant1List = await promptService.listPrompts(1, 1);
    const tenant2List = await promptService.listPrompts(2, 1);

    expect(tenant1List).toHaveLength(2);
    expect(tenant2List).toHaveLength(2);
    expect(tenant1List.every(p => p.tenantId === 1)).toBe(true);
    expect(tenant2List.every(p => p.tenantId === 2)).toBe(true);

    // Test 2: Get by ID prevents cross-tenant access
    for (const t1Prompt of tenant1Prompts) {
      expect(await promptService.getPromptById(1, 1, t1Prompt.id)).toBeDefined();
      expect(await promptService.getPromptById(2, 1, t1Prompt.id)).toBeNull();
    }

    for (const t2Prompt of tenant2Prompts) {
      expect(await promptService.getPromptById(2, 1, t2Prompt.id)).toBeDefined();
      expect(await promptService.getPromptById(1, 1, t2Prompt.id)).toBeNull();
    }

    // Test 3: Update prevents cross-tenant modification
    await expect(
      promptService.updatePrompt(1, 1, tenant2Prompts[0].id, { name: "Hacked" })
    ).rejects.toThrow("Prompt not found");

    const unchanged = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(tenant2Prompts[0].id).first<Prompt>();

    expect(unchanged?.name).toBe("T2 Prompt A"); // Unchanged

    // Test 4: Deactivate prevents cross-tenant modification
    await promptService.deactivatePrompt(1, 1, tenant2Prompts[0].id);

    const stillActive = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    ).bind(tenant2Prompts[0].id).first<{ isActive: number }>();

    expect(stillActive?.isActive).toBe(1); // Still active

    // Test 5: Version access prevents cross-tenant access
    expect(await promptService.getPromptVersion(1, 1, tenant2Prompts[0].id, 1)).toBeUndefined();
    expect(await promptService.getPromptVersion(2, 1, tenant2Prompts[0].id, 1)).toBeDefined();

    // Test 6: List versions prevents cross-tenant access
    const t1Versions = await promptService.listPromptVersions(1, 1, tenant2Prompts[0].id);
    expect(t1Versions).toEqual([]);

    const t2Versions = await promptService.listPromptVersions(2, 1, tenant2Prompts[0].id);
    expect(t2Versions).toHaveLength(1);

    // Verify database integrity using direct SQL
    const allPrompts = await env.DB.prepare(
      "SELECT * FROM Prompts ORDER BY tenantId, id"
    ).all<Prompt>();

    expect(allPrompts.results).toHaveLength(4);
    expect(allPrompts.results.filter(p => p.tenantId === 1)).toHaveLength(2);
    expect(allPrompts.results.filter(p => p.tenantId === 2)).toHaveLength(2);
  });

  it("should handle versioning correctly across tenant boundaries", async () => {
    // Create prompts for different tenants with same ID sequence
    const t1Prompt = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "T1",
      slug: "t1",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const t2Prompt = await promptService.createPrompt({
      tenantId: 2,
      projectId: 1,
      name: "T2",
      slug: "t2",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Update both to create version 2
    await promptService.updatePrompt(1, 1, t1Prompt.id, { body: "t1-v2" });
    await promptService.updatePrompt(2, 1, t2Prompt.id, { body: "t2-v2" });

    // Verify versions are isolated
    const t1v1 = await promptService.getPromptVersion(1, 1, t1Prompt.id, 1);
    const t1v2 = await promptService.getPromptVersion(1, 1, t1Prompt.id, 2);
    const t2v1 = await promptService.getPromptVersion(2, 1, t2Prompt.id, 1);
    const t2v2 = await promptService.getPromptVersion(2, 1, t2Prompt.id, 2);

    expect(t1v1?.body).toBe("{}");
    expect(t1v2?.body).toBe("t1-v2");
    expect(t2v1?.body).toBe("{}");
    expect(t2v2?.body).toBe("t2-v2");

    // Cross-tenant access should fail
    expect(await promptService.getPromptVersion(1, 1, t2Prompt.id, 1)).toBeUndefined();
    expect(await promptService.getPromptVersion(2, 1, t1Prompt.id, 1)).toBeUndefined();

    // Verify all versions exist in database
    const allVersions = await env.DB.prepare(
      "SELECT * FROM PromptVersions ORDER BY tenantId, promptId, version"
    ).all<PromptVersion>();

    expect(allVersions.results).toHaveLength(4);
  });
});
