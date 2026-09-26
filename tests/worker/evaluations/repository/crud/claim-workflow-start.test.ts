import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../../worker/evaluations/repositories/evaluation.repository";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { applyMigrations } from "../../../helpers/db-setup";

describe("EvaluationRepository - claimWorkflowStart and releaseWorkflowStart", () => {
  let repository: EvaluationRepository;
  let evaluationId: EntityId;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
    const evaluation = await repository.createWithPrompts(
      {
        tenantId: 1,
        projectId: 1,
        datasetId: 1,
        name: "Eval",
        slug: "eval",
        type: "run",
        state: "created",
        workflowId: null,
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
      },
      []
    );
    evaluationId = new EntityId(evaluation.id, new ProjectId(1, 1, "test-user"));
  });

  it("lets only the first caller claim the start", async () => {
    expect(await repository.claimWorkflowStart(evaluationId)).toBe(true);
    expect(await repository.claimWorkflowStart(evaluationId)).toBe(false);
  });

  it("allows a new claim after a release", async () => {
    await repository.claimWorkflowStart(evaluationId);

    await repository.releaseWorkflowStart(evaluationId);

    expect(await repository.claimWorkflowStart(evaluationId)).toBe(true);
  });

  it("does not claim an evaluation of another tenant", async () => {
    const foreign = new EntityId(evaluationId.id, new ProjectId(1, 2, "other"));

    expect(await repository.claimWorkflowStart(foreign)).toBe(false);
  });
});
