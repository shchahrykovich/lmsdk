import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId, createPromptVersionId } from "../../helpers/id-helpers";
import type { PromptVersion } from "../../../../worker/db/schema";

describe("PromptService - getPromptVersion", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return specific version of a prompt", async () => {
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

    const versionId1 = createPromptVersionId(1, created.id, 1, 1);
    const v1 = await promptService.getPromptVersion(versionId1);
    expect(v1).toBeDefined();
    expect(v1?.version).toBe(1);
    expect(v1?.body).toBe("v1");

    const versionId2 = createPromptVersionId(2, created.id, 1, 1);
    const v2 = await promptService.getPromptVersion(versionId2);
    expect(v2).toBeDefined();
    expect(v2?.version).toBe(2);
    expect(v2?.body).toBe("v2");

    const versionId3 = createPromptVersionId(3, created.id, 1, 1);
    const v3 = await promptService.getPromptVersion(versionId3);
    expect(v3).toBeDefined();
    expect(v3?.version).toBe(3);
    expect(v3?.body).toBe("v3");
  });

  it("should return undefined when version does not exist", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const versionId = createPromptVersionId(99, created.id, 1, 1);
    const result = await promptService.getPromptVersion(versionId);

    expect(result).toBeUndefined();
  });

  it("should return undefined when tenantId does not match (cross-tenant protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongTenantVersionId = createPromptVersionId(1, created.id, 1, 2);
    const result = await promptService.getPromptVersion(wrongTenantVersionId);

    expect(result).toBeUndefined();

    const dbVersion = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? AND version = ?"
    ).bind(created.id, 1).first<PromptVersion>();

    expect(dbVersion).toBeDefined();
    expect(dbVersion?.tenantId).toBe(1);
  });

  it("should return undefined when projectId does not match (cross-project protection)", async () => {
    const projectId = createProjectId(1, 1);
    const created = await promptService.createPrompt(projectId, {
      name: "Test",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const wrongProjectVersionId = createPromptVersionId(1, created.id, 2, 1);
    const result = await promptService.getPromptVersion(wrongProjectVersionId);

    expect(result).toBeUndefined();

    const dbVersion = await env.DB.prepare(
      "SELECT * FROM PromptVersions WHERE promptId = ? AND version = ?"
    ).bind(created.id, 1).first<PromptVersion>();

    expect(dbVersion).toBeDefined();
    expect(dbVersion?.projectId).toBe(1);
  });
});
