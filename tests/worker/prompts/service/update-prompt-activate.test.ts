import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { EntityId } from "../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";
import { seedPrompt, validPromptBody } from "../../helpers/seed";

const routerVersion = async (promptId: number): Promise<number | undefined> => {
  const row = await env.DB.prepare("SELECT version FROM PromptRouters WHERE promptId = ?")
    .bind(promptId)
    .first<{ version: number }>();
  return row?.version;
};

describe("PromptService - updatePrompt activate option", () => {
  let service: PromptService;
  const project = new ProjectId(1, 1, "test-user");

  beforeEach(async () => {
    await applyMigrations();
    service = new PromptService(drizzle(env.DB));
  });

  it("keeps the active version when activate is false", async () => {
    const { prompt } = await seedPrompt(project, "classify");
    const promptId = new EntityId(prompt.id, project);

    const result = await service.updatePrompt(promptId, { body: validPromptBody }, { activate: false });

    expect(result.version).toBe(2);
    expect(await routerVersion(prompt.id)).toBe(1);
  });

  it("moves the active version when activate is true", async () => {
    const { prompt } = await seedPrompt(project, "classify");
    const promptId = new EntityId(prompt.id, project);

    await service.updatePrompt(promptId, { body: validPromptBody }, { activate: true });

    expect(await routerVersion(prompt.id)).toBe(2);
  });

  it("moves the active version by default, as the UI Publish button expects", async () => {
    const { prompt } = await seedPrompt(project, "classify");
    const promptId = new EntityId(prompt.id, project);

    await service.updatePrompt(promptId, { body: validPromptBody });

    expect(await routerVersion(prompt.id)).toBe(2);
  });
});
