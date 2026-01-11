import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../../worker/evaluations/evaluation.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import { ProjectId } from "../../../../../worker/shared/project-id";

describe("EvaluationRepository - findByTenantAndProject", () => {
  let repository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  it("should return evaluations scoped to tenant and project", async () => {
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
      name: "Eval B",
      slug: "eval-b",
      type: "comparison",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await repository.create({
      tenantId: 2,
      projectId: 1,
      name: "Eval C",
      slug: "eval-c",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const projectId = new ProjectId(1, 1, "user-1");
    const evaluations = await repository.findByTenantAndProject(projectId);

    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].name).toBe("Eval A");
  });
});
