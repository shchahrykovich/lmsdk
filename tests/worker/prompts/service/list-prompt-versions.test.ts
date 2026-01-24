import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId } from "../../helpers/id-helpers";

describe("PromptService - listPromptVersions", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return all versions ordered by version DESC", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "V1",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "v1",
    });

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.updatePrompt(entityId, { body: "v2" });
    await promptService.updatePrompt(entityId, { body: "v3" });
    await promptService.updatePrompt(entityId, { body: "v4" });

    const versions = await promptService.listPromptVersions(entityId);

    expect(versions).toHaveLength(4);
    expect(versions[0].version).toBe(4);
    expect(versions[1].version).toBe(3);
    expect(versions[2].version).toBe(2);
    expect(versions[3].version).toBe(1);
  });

  it("should return empty array when no versions exist", async () => {
    const entityId = createEntityId(99999, 1, 1);
    const versions = await promptService.listPromptVersions(entityId);

    expect(versions).toEqual([]);
  });

  it("should only return versions for the specified tenant (cross-tenant protection)", async () => {
    const tenant1Project = createProjectId(1, 1);
    const tenant2Project = createProjectId(1, 2);

    const t1Prompt = await promptService.createPrompt(tenant1Project, {
      name: "T1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "t1",
    });

    const entityId1 = createEntityId(t1Prompt.id, 1, 1);
    await promptService.updatePrompt(entityId1, { body: "t1-v2" });

    const t2Prompt = await promptService.createPrompt(tenant2Project, {
      name: "T2 Prompt",
      slug: "t2-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "t2",
    });

    const entityId2 = createEntityId(t2Prompt.id, 1, 2);
    await promptService.updatePrompt(entityId2, { body: "t2-v2" });

    const t1Versions = await promptService.listPromptVersions(entityId1);
    expect(t1Versions).toHaveLength(2);
    expect(t1Versions.every(v => v.tenantId === 1)).toBe(true);

    const wrongTenantEntityId = createEntityId(t1Prompt.id, 1, 2);
    const wrongTenantVersions = await promptService.listPromptVersions(wrongTenantEntityId);
    expect(wrongTenantVersions).toEqual([]);

    const dbVersions = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM PromptVersions WHERE promptId = ?"
    ).bind(t1Prompt.id).first<{ count: number }>();

    expect(dbVersions?.count).toBe(2);
  });

  it("should only return versions for the specified project (cross-project protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const entityId = createEntityId(created.id, 1, 1);
    await promptService.updatePrompt(entityId, { body: "v2" });

    const wrongProjectEntityId = createEntityId(created.id, 2, 1);
    const wrongProjectVersions = await promptService.listPromptVersions(wrongProjectEntityId);
    expect(wrongProjectVersions).toEqual([]);

    const correctVersions = await promptService.listPromptVersions(entityId);
    expect(correctVersions).toHaveLength(2);
  });
});
