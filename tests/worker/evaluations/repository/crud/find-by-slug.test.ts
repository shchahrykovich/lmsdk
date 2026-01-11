import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../../worker/evaluations/evaluation.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import { ProjectId } from "../../../../../worker/shared/project-id";

describe("EvaluationRepository - findBySlug", () => {
  let repository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  it("should find evaluation by slug for tenant and project", async () => {
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
      slug: "eval-a",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const projectId = new ProjectId(1, 1, "user-1");
    const evaluation = await repository.findBySlug(projectId, "eval-a");

    expect(evaluation).toBeDefined();
    expect(evaluation?.projectId).toBe(1);
  });

  it("should return undefined when slug is missing", async () => {
    const projectId = new ProjectId(1, 1, "user-1");
    const evaluation = await repository.findBySlug(projectId, "missing");

    expect(evaluation).toBeUndefined();
  });
});
