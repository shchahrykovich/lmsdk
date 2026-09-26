import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptRepository } from "../../../../worker/prompts/prompt.repository";
import { applyMigrations } from "../../helpers/db-setup";
import { countRows } from "../../helpers/seed";

describe("PromptRepository - createPromptWithFirstVersion", () => {
  let repository: PromptRepository;
  const input = {
    tenantId: 1,
    projectId: 1,
    name: "Classifier",
    slug: "classifier",
    provider: "openai",
    model: "gpt-4o-mini",
    body: '{"messages":[]}',
  };

  beforeEach(async () => {
    await applyMigrations();
    repository = new PromptRepository(drizzle(env.DB));
  });

  it("writes the prompt, version 1 and the router pointing at the new prompt", async () => {
    const prompt = await repository.createPromptWithFirstVersion(input);

    const version = await env.DB.prepare(
      "SELECT promptId, version, tenantId, projectId, slug, body FROM PromptVersions"
    ).first<{ promptId: number; version: number; tenantId: number; projectId: number; slug: string; body: string }>();
    const router = await env.DB.prepare(
      "SELECT promptId, version, tenantId, projectId FROM PromptRouters"
    ).first<{ promptId: number; version: number; tenantId: number; projectId: number }>();

    expect(prompt.latestVersion).toBe(1);
    expect(version).toEqual({ promptId: prompt.id, version: 1, tenantId: 1, projectId: 1, slug: "classifier", body: '{"messages":[]}' });
    expect(router).toEqual({ promptId: prompt.id, version: 1, tenantId: 1, projectId: 1 });
  });

  it("writes nothing when the version insert fails", async () => {
    await env.DB.prepare(
      "INSERT INTO PromptVersions (promptId, tenantId, projectId, version, name, provider, model, body, slug) VALUES (1, 1, 1, 1, 'x', 'openai', 'm', '{}', 'x')"
    ).run();

    await expect(repository.createPromptWithFirstVersion(input)).rejects.toThrow();

    expect(await countRows("Prompts")).toBe(0);
    expect(await countRows("PromptRouters")).toBe(0);
    expect(await countRows("PromptVersions")).toBe(1);
  });
});
