import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationPromptRepository } from "../../../../../worker/repositories/evaluation-prompt.repository";
import { EvaluationRepository } from "../../../../../worker/evaluations/evaluation.repository";
import { applyMigrations } from "../../../helpers/db-setup";

describe("EvaluationPromptRepository - listByEvaluation", () => {
  let repository: EvaluationPromptRepository;
  let evaluationRepository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationPromptRepository(env.DB);
    evaluationRepository = new EvaluationRepository(env.DB);
  });

  it("should list prompts for the evaluation", async () => {
    const evaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval",
      slug: "eval",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await repository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        evaluationId: evaluation.id,
        promptId: 10,
        versionId: 1,
      },
      {
        tenantId: 1,
        projectId: 1,
        evaluationId: evaluation.id,
        promptId: 11,
        versionId: 2,
      },
    ]);

    const prompts = await repository.listByEvaluation({
      tenantId: 1,
      projectId: 1,
      evaluationId: evaluation.id,
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[0]?.promptId).toBe(10);
    expect(prompts[1]?.promptId).toBe(11);
  });

  it("should scope prompts by evaluation", async () => {
    const evaluation = await evaluationRepository.create({
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
    const otherEvaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval B",
      slug: "eval-b",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await repository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        evaluationId: evaluation.id,
        promptId: 12,
        versionId: 3,
      },
      {
        tenantId: 1,
        projectId: 1,
        evaluationId: otherEvaluation.id,
        promptId: 13,
        versionId: 4,
      },
    ]);

    const prompts = await repository.listByEvaluation({
      tenantId: 1,
      projectId: 1,
      evaluationId: evaluation.id,
    });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.promptId).toBe(12);
  });
});
