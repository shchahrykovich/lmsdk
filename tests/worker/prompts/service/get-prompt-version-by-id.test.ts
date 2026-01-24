import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { PromptRepository } from "../../../../worker/prompts/prompt.repository";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId } from "../../helpers/id-helpers";

describe("PromptService - getPromptVersionById", () => {
  let service: PromptService;
  let repository: PromptRepository;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    service = new PromptService(db);
    repository = new PromptRepository(db);
  });

  it("should return prompt version by id", async () => {
    const prompt = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Prompt",
      slug: "prompt",
      provider: "openai",
      model: "gpt-4o",
      body: "{}",
      isDeleted: false,
      isActive: true,
      latestVersion: 1,
    });

    const version = await repository.createPromptVersion({
      promptId: prompt.id,
      tenantId: 1,
      projectId: 1,
      version: 1,
      name: "Prompt v1",
      provider: "openai",
      model: "gpt-4o",
      body: "{}",
      slug: "prompt-v1",
    });

    const projectId = createProjectId(1, 1);
    const found = await service.getPromptVersionById(projectId, version.id);

    expect(found).toBeDefined();
    expect(found?.id).toBe(version.id);
  });

  it("should return undefined when project does not match", async () => {
    const prompt = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Prompt",
      slug: "prompt",
      provider: "openai",
      model: "gpt-4o",
      body: "{}",
      isDeleted: false,
      isActive: true,
      latestVersion: 1,
    });

    const version = await repository.createPromptVersion({
      promptId: prompt.id,
      tenantId: 1,
      projectId: 1,
      version: 1,
      name: "Prompt v1",
      provider: "openai",
      model: "gpt-4o",
      body: "{}",
      slug: "prompt-v1",
    });

    const wrongProjectId = createProjectId(2, 1);
    const found = await service.getPromptVersionById(wrongProjectId, version.id);

    expect(found).toBeUndefined();
  });
});
