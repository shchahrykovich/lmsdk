import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationPromptRepository } from "../../../../../worker/repositories/evaluation-prompt.repository";
import { EvaluationRepository } from "../../../../../worker/evaluations/evaluation.repository";
import { applyMigrations } from "../../../helpers/db-setup";

describe("EvaluationPromptRepository - createMany", () => {
  let promptRepository: EvaluationPromptRepository;
  let evaluationRepository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    promptRepository = new EvaluationPromptRepository(env.DB);
    evaluationRepository = new EvaluationRepository(env.DB);
  });

  it("should insert multiple evaluation prompts", async () => {
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

    const records = await promptRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        evaluationId: evaluation.id,
        promptId: 10,
        versionId: 2,
      },
      {
        tenantId: 1,
        projectId: 1,
        evaluationId: evaluation.id,
        promptId: 11,
        versionId: 3,
      },
    ]);

    expect(records).toHaveLength(2);

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM EvaluationPrompts WHERE evaluationId = ?"
    )
      .bind(evaluation.id)
      .first<{ count: number }>();

    expect(result?.count).toBe(2);
  });

  it("should return empty array when no records are provided", async () => {
    const records = await promptRepository.createMany([]);
    expect(records).toEqual([]);
  });
});
