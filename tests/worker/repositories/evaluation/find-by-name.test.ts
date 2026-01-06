import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../worker/repositories/evaluation.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("EvaluationRepository - findByName", () => {
  let repository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  it("should find evaluation by name for tenant and project", async () => {
    await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval A",
      slug: "eval-a",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await repository.create({
      tenantId: 1,
      projectId: 2,
      name: "Eval A",
      slug: "eval-a-project-2",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const evaluation = await repository.findByName({
      tenantId: 1,
      projectId: 1,
      name: "Eval A",
    });

    expect(evaluation).toBeDefined();
    expect(evaluation?.projectId).toBe(1);
  });

  it("should return undefined when name is missing", async () => {
    const evaluation = await repository.findByName({
      tenantId: 1,
      projectId: 1,
      name: "Missing",
    });

    expect(evaluation).toBeUndefined();
  });
});
