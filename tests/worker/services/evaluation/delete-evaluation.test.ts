import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/services/evaluation.service";
import { EvaluationRepository } from "../../../../worker/repositories/evaluation.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("EvaluationService - deleteEvaluation", () => {
  let evaluationService: EvaluationService;
  let evaluationRepository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    evaluationService = new EvaluationService(env.DB);
    evaluationRepository = new EvaluationRepository(env.DB);
  });

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

    await evaluationService.deleteEvaluation(
      { tenantId: 1, projectId: 1 },
      evaluation.id
    );

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Evaluations WHERE id = ? AND tenantId = ? AND projectId = ?"
    )
      .bind(evaluation.id, 1, 1)
      .first<{ count: number }>();

    expect(result?.count).toBe(0);
  });

  it("should throw error when evaluation not found", async () => {
    await expect(
      evaluationService.deleteEvaluation(
        { tenantId: 1, projectId: 1 },
        999
      )
    ).rejects.toThrow("Evaluation not found");
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
      evaluationService.deleteEvaluation(
        { tenantId: 2, projectId: 1 },
        evaluation.id
      )
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
      evaluationService.deleteEvaluation(
        { tenantId: 1, projectId: 2 },
        evaluation.id
      )
    ).rejects.toThrow("Evaluation not found");

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Evaluations WHERE id = ? AND projectId = ?"
    )
      .bind(evaluation.id, 1)
      .first<{ count: number }>();

    expect(result?.count).toBe(1);
  });
});
