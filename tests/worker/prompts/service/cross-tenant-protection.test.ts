import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId, createPromptVersionId } from "../../helpers/id-helpers";
import type { Prompt, PromptVersion } from "../../../../worker/db/schema";

describe("PromptService - Cross-tenant and cross-project protection comprehensive tests", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should prevent any cross-tenant data leakage across all operations", async () => {
    const tenant1Project = createProjectId(1, 1);
    const tenant2Project = createProjectId(1, 2);

    const tenant1Prompts = [
      await promptService.createPrompt(tenant1Project, {
        name: "T1 Prompt A",
        slug: "t1-a",
        provider: "openai",
        model: "gpt-4",
        body: "t1a",
      }),
      await promptService.createPrompt(tenant1Project, {
        name: "T1 Prompt B",
        slug: "t1-b",
        provider: "openai",
        model: "gpt-4",
        body: "t1b",
      }),
    ];

    const tenant2Prompts = [
      await promptService.createPrompt(tenant2Project, {
        name: "T2 Prompt A",
        slug: "t2-a",
        provider: "openai",
        model: "gpt-4",
        body: "t2a",
      }),
      await promptService.createPrompt(tenant2Project, {
        name: "T2 Prompt B",
        slug: "t2-b",
        provider: "openai",
        model: "gpt-4",
        body: "t2b",
      }),
    ];

    const tenant1List = await promptService.listPrompts(tenant1Project);
    const tenant2List = await promptService.listPrompts(tenant2Project);

    expect(tenant1List).toHaveLength(2);
    expect(tenant2List).toHaveLength(2);
    expect(tenant1List.every(p => p.tenantId === 1)).toBe(true);
    expect(tenant2List.every(p => p.tenantId === 2)).toBe(true);

    for (const t1Prompt of tenant1Prompts) {
      const correctEntityId = createEntityId(t1Prompt.id, 1, 1);
      const wrongTenantEntityId = createEntityId(t1Prompt.id, 1, 2);
      expect(await promptService.getPromptById(correctEntityId)).toBeDefined();
      expect(await promptService.getPromptById(wrongTenantEntityId)).toBeNull();
    }

    for (const t2Prompt of tenant2Prompts) {
      const correctEntityId = createEntityId(t2Prompt.id, 1, 2);
      const wrongTenantEntityId = createEntityId(t2Prompt.id, 1, 1);
      expect(await promptService.getPromptById(correctEntityId)).toBeDefined();
      expect(await promptService.getPromptById(wrongTenantEntityId)).toBeNull();
    }

    const wrongTenantEntityId = createEntityId(tenant2Prompts[0].id, 1, 1);
    await expect(
      promptService.updatePrompt(wrongTenantEntityId, { name: "Hacked" })
    ).rejects.toThrow("Prompt not found");

    const unchanged = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE id = ?"
    ).bind(tenant2Prompts[0].id).first<Prompt>();

    expect(unchanged?.name).toBe("T2 Prompt A");

    await promptService.deactivatePrompt(wrongTenantEntityId);

    const stillActive = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    ).bind(tenant2Prompts[0].id).first<{ isActive: number }>();

    expect(stillActive?.isActive).toBe(1);

    const wrongTenantVersionId = createPromptVersionId(1, tenant2Prompts[0].id, 1, 1);
    const correctVersionId = createPromptVersionId(1, tenant2Prompts[0].id, 1, 2);
    expect(await promptService.getPromptVersion(wrongTenantVersionId)).toBeUndefined();
    expect(await promptService.getPromptVersion(correctVersionId)).toBeDefined();

    const t1Versions = await promptService.listPromptVersions(wrongTenantEntityId);
    expect(t1Versions).toEqual([]);

    const correctEntityId = createEntityId(tenant2Prompts[0].id, 1, 2);
    const t2Versions = await promptService.listPromptVersions(correctEntityId);
    expect(t2Versions).toHaveLength(1);

    const allPrompts = await env.DB.prepare(
      "SELECT * FROM Prompts ORDER BY tenantId, id"
    ).all<Prompt>();

    expect(allPrompts.results).toHaveLength(4);
    expect(allPrompts.results.filter(p => p.tenantId === 1)).toHaveLength(2);
    expect(allPrompts.results.filter(p => p.tenantId === 2)).toHaveLength(2);
  });

  it("should handle versioning correctly across tenant boundaries", async () => {
    const tenant1Project = createProjectId(1, 1);
    const tenant2Project = createProjectId(1, 2);

    const t1Prompt = await promptService.createPrompt(tenant1Project, {
      name: "T1",
      slug: "t1",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const t2Prompt = await promptService.createPrompt(tenant2Project, {
      name: "T2",
      slug: "t2",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId1 = createEntityId(t1Prompt.id, 1, 1);
    const entityId2 = createEntityId(t2Prompt.id, 1, 2);

    await promptService.updatePrompt(entityId1, { body: "t1-v2" });
    await promptService.updatePrompt(entityId2, { body: "t2-v2" });

    const t1v1 = await promptService.getPromptVersion(createPromptVersionId(1, t1Prompt.id, 1, 1));
    const t1v2 = await promptService.getPromptVersion(createPromptVersionId(2, t1Prompt.id, 1, 1));
    const t2v1 = await promptService.getPromptVersion(createPromptVersionId(1, t2Prompt.id, 1, 2));
    const t2v2 = await promptService.getPromptVersion(createPromptVersionId(2, t2Prompt.id, 1, 2));

    expect(t1v1?.body).toBe("{}");
    expect(t1v2?.body).toBe("t1-v2");
    expect(t2v1?.body).toBe("{}");
    expect(t2v2?.body).toBe("t2-v2");

    expect(await promptService.getPromptVersion(createPromptVersionId(1, t2Prompt.id, 1, 1))).toBeUndefined();
    expect(await promptService.getPromptVersion(createPromptVersionId(1, t1Prompt.id, 1, 2))).toBeUndefined();

    const allVersions = await env.DB.prepare(
      "SELECT * FROM PromptVersions ORDER BY tenantId, promptId, version"
    ).all<PromptVersion>();

    expect(allVersions.results).toHaveLength(4);
  });
});
