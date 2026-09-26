import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { ConflictError } from "../../../../worker/shared/errors";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";
import { countRows, validPromptBody } from "../../helpers/seed";

describe("PromptService - createPrompt conflicts", () => {
  let service: PromptService;
  const project = new ProjectId(1, 1, "test-user");
  const input = {
    name: "Classifier",
    slug: "classifier",
    provider: "openai",
    model: "gpt-4o-mini",
    body: validPromptBody,
  };

  beforeEach(async () => {
    await applyMigrations();
    service = new PromptService(drizzle(env.DB));
  });

  it("throws ConflictError for a duplicate slug", async () => {
    await service.createPrompt(project, input);

    await expect(
      service.createPrompt(project, { ...input, name: "Other name" })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await countRows("Prompts")).toBe(1);
  });

  it("throws ConflictError for a duplicate name", async () => {
    await service.createPrompt(project, input);

    await expect(
      service.createPrompt(project, { ...input, slug: "other-slug" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows the same slug in another project", async () => {
    await service.createPrompt(project, input);

    await expect(
      service.createPrompt(new ProjectId(2, 1, "test-user"), input)
    ).resolves.toBeDefined();
  });
});
