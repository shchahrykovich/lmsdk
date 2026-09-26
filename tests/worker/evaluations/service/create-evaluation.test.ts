import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/evaluations/evaluation.service";
import { EvaluationRepository } from "../../../../worker/evaluations/repositories/evaluation.repository";
import { applyMigrations } from "../../helpers/db-setup";
import { ProjectId } from "../../../../worker/shared/project-id";
import { seedDataSet, seedPrompt } from "../../helpers/seed";

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
    const project = mockProjectId(1, 1);
    const dataset = await seedDataSet(project, "Tickets");
    const promptA = await seedPrompt(project, "prompt-a", 1);
    const promptB = await seedPrompt(project, "prompt-b");

    const evaluation = await evaluationService.createEvaluation(project, {
      name: "My Evaluation",
      type: "run",
      datasetId: dataset.id,
      prompts: [
        { promptId: promptA.prompt.id, versionId: promptA.versionIds[1] },
        { promptId: promptB.prompt.id, versionId: promptB.versionIds[0] },
      ],
    });

    expect(evaluation.name).toBe("My Evaluation");
    expect(evaluation.slug).toBe("my-evaluation");
    expect(evaluation.state).toBe("created");
    expect(evaluation.datasetId).toBe(dataset.id);

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

    const project = mockProjectId(1, 1);
    const dataset = await seedDataSet(project, "Tickets");
    const { prompt, versionIds } = await seedPrompt(project, "prompt-a");

    const evaluation = await evaluationService.createEvaluation(project, {
      name: "My Evaluation",
      type: "run",
      datasetId: dataset.id,
      prompts: [{ promptId: prompt.id, versionId: versionIds[0] }],
    });

    expect(evaluation.slug).toBe("my-evaluation-2");
  });
});
