import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/evaluations/evaluation.service";
import { EvaluationRepository } from "../../../../worker/evaluations/evaluation.repository";
import { applyMigrations } from "../../helpers/db-setup";
import { EntityId } from "../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../worker/shared/project-id";

describe("EvaluationService - deleteEvaluation", () => {
  let evaluationService: EvaluationService;
  let evaluationRepository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    evaluationService = new EvaluationService(env.DB);
    evaluationRepository = new EvaluationRepository(env.DB);
  });

  const mockEntityId = (
    evaluationId: number,
    projectId: number,
    tenantId: number
  ): EntityId =>
    new EntityId(evaluationId, new ProjectId(projectId, tenantId, "test-user"));

  it("should delete evaluation successfully", async () => {
    const evaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Test Evaluation",
      slug: "test-evaluation",
      type: "run",
      state: "created",
      workflowId: null,
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await evaluationService.deleteEvaluation(mockEntityId(evaluation.id, 1, 1));

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Evaluations WHERE id = ? AND tenantId = ? AND projectId = ?"
    )
      .bind(evaluation.id, 1, 1)
      .first<{ count: number }>();

    expect(result?.count).toBe(0);
  });

  it("should throw error when evaluation not found", async () => {
    await expect(evaluationService.deleteEvaluation(mockEntityId(999, 1, 1))).rejects.toThrow(
      "Evaluation not found"
    );
  });

  it("should not delete evaluation from different tenant", async () => {
    const evaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Test Evaluation",
      slug: "test-evaluation",
      type: "run",
      state: "created",
      workflowId: null,
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await expect(
      evaluationService.deleteEvaluation(mockEntityId(evaluation.id, 1, 2))
    ).rejects.toThrow("Evaluation not found");

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Evaluations WHERE id = ? AND tenantId = ?"
    )
      .bind(evaluation.id, 1)
      .first<{ count: number }>();

    expect(result?.count).toBe(1);
  });

  it("should not delete evaluation from different project", async () => {
    const evaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Test Evaluation",
      slug: "test-evaluation",
      type: "run",
      state: "created",
      workflowId: null,
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await expect(
      evaluationService.deleteEvaluation(mockEntityId(evaluation.id, 2, 1))
    ).rejects.toThrow("Evaluation not found");

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Evaluations WHERE id = ? AND projectId = ?"
    )
      .bind(evaluation.id, 1)
      .first<{ count: number }>();

    expect(result?.count).toBe(1);
  });
});
