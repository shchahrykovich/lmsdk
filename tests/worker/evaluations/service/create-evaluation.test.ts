import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/evaluations/evaluation.service";
import { EvaluationRepository } from "../../../../worker/evaluations/evaluation.repository";
import { applyMigrations } from "../../helpers/db-setup";
import { ProjectId } from "../../../../worker/shared/project-id";

describe("EvaluationService - createEvaluation", () => {
  let evaluationService: EvaluationService;
  let evaluationRepository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    evaluationService = new EvaluationService(env.DB);
    evaluationRepository = new EvaluationRepository(env.DB);
  });

  const mockProjectId = (projectId: number, tenantId: number): ProjectId =>
    new ProjectId(projectId, tenantId, "test-user");

  it("should create evaluation and prompt mappings", async () => {
    const evaluation = await evaluationService.createEvaluation(mockProjectId(1, 1), {
      name: "My Evaluation",
      type: "run",
      datasetId: 5,
      prompts: [
        { promptId: 10, versionId: 2 },
        { promptId: 11, versionId: 3 },
      ],
    });

    expect(evaluation.name).toBe("My Evaluation");
    expect(evaluation.slug).toBe("my-evaluation");
    expect(evaluation.state).toBe("created");
    expect(evaluation.datasetId).toBe(5);

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM EvaluationPrompts WHERE evaluationId = ?"
    )
      .bind(evaluation.id)
      .first<{ count: number }>();

    expect(result?.count).toBe(2);
  });

  it("should throw when evaluation name already exists", async () => {
    await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Duplicate",
      slug: "duplicate",
      type: "run",
      state: "created",
      workflowId: null,
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await expect(
      evaluationService.createEvaluation(mockProjectId(1, 1), {
        name: "Duplicate",
        type: "run",
        datasetId: 5,
        prompts: [{ promptId: 1, versionId: 1 }],
      })
    ).rejects.toThrow("Evaluation name already exists");
  });

  it("should suffix slug when generated slug already exists", async () => {
    await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "My-Evaluation",
      slug: "my-evaluation",
      type: "run",
      state: "created",
      workflowId: null,
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const evaluation = await evaluationService.createEvaluation(mockProjectId(1, 1), {
      name: "My Evaluation",
      type: "run",
      datasetId: 5,
      prompts: [{ promptId: 1, versionId: 1 }],
    });

    expect(evaluation.slug).toBe("my-evaluation-2");
  });
});
