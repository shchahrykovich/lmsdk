import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { EntityId } from "../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";
import { seedPrompt } from "../../helpers/seed";

describe("PromptService - getActiveRouterVersions", () => {
  let service: PromptService;
  const project = new ProjectId(1, 1, "test-user");

  beforeEach(async () => {
    await applyMigrations();
    service = new PromptService(drizzle(env.DB));
  });

  it("returns the active version of every prompt in the project", async () => {
    const a = await seedPrompt(project, "a", 1);
    const b = await seedPrompt(project, "b", 2);
    await service.setRouterVersion(new EntityId(b.prompt.id, project), 1);

    const versions = await service.getActiveRouterVersions(project);

    expect(Object.fromEntries(versions)).toEqual({ [a.prompt.id]: 2, [b.prompt.id]: 1 });
  });

  it("does not return prompts of another project or tenant", async () => {
    await seedPrompt(new ProjectId(1, 2, "other"), "a");
    await seedPrompt(new ProjectId(2, 1, "test-user"), "b");

    const versions = await service.getActiveRouterVersions(project);

    expect(versions.size).toBe(0);
  });
});
