import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptRepository } from "../../../../worker/prompts/prompt.repository";
import { EntityId } from "../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";

describe("PromptRepository - addPromptVersion", () => {
  let repository: PromptRepository;
  const project = new ProjectId(1, 1, "test-user");

  beforeEach(async () => {
    await applyMigrations();
    repository = new PromptRepository(drizzle(env.DB));
  });

  const seed = async () => {
    const prompt = await repository.createPromptWithFirstVersion({
      tenantId: 1,
      projectId: 1,
      name: "Classifier",
      slug: "classifier",
      provider: "openai",
      model: "gpt-4o-mini",
      body: '{"v":1}',
    });
    return { prompt, promptId: new EntityId(prompt.id, project) };
  };

  const readState = async (promptId: number) => ({
    prompt: await env.DB.prepare("SELECT latestVersion, body FROM Prompts WHERE id = ?")
      .bind(promptId)
      .first<{ latestVersion: number; body: string }>(),
    router: await env.DB.prepare("SELECT version FROM PromptRouters WHERE promptId = ?")
      .bind(promptId)
      .first<{ version: number }>(),
  });

  it("adds the next version without moving the router when activate is false", async () => {
    const { prompt, promptId } = await seed();
    const values = { name: prompt.name, provider: prompt.provider, model: prompt.model, body: '{"v":2}' };

    const version = await repository.addPromptVersion(promptId, prompt, values, false);

    expect(version).toBe(2);
    expect(await readState(prompt.id)).toEqual({
      prompt: { latestVersion: 2, body: '{"v":2}' },
      router: { version: 1 },
    });
  });

  it("moves the router when activate is true", async () => {
    const { prompt, promptId } = await seed();
    const values = { name: prompt.name, provider: prompt.provider, model: prompt.model, body: '{"v":2}' };

    await repository.addPromptVersion(promptId, prompt, values, true);

    expect((await readState(prompt.id)).router).toEqual({ version: 2 });
  });

  it("changes nothing when the version already exists (two writers race)", async () => {
    const { prompt, promptId } = await seed();
    await env.DB.prepare(
      "INSERT INTO PromptVersions (promptId, tenantId, projectId, version, name, provider, model, body, slug) VALUES (?, 1, 1, 2, 'x', 'openai', 'm', '{\"other\":true}', 'classifier')"
    ).bind(prompt.id).run();
    const values = { name: prompt.name, provider: prompt.provider, model: prompt.model, body: '{"v":2}' };

    await expect(repository.addPromptVersion(promptId, prompt, values, true)).rejects.toThrow();

    expect(await readState(prompt.id)).toEqual({
      prompt: { latestVersion: 1, body: '{"v":1}' },
      router: { version: 1 },
    });
  });
});
