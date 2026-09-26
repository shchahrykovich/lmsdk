import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../../worker/evaluations/repositories/evaluation.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import { countRows } from "../../../helpers/seed";

describe("EvaluationRepository - createWithPrompts", () => {
  let repository: EvaluationRepository;
  const newEvaluation = {
    tenantId: 1,
    projectId: 1,
    datasetId: 3,
    name: "Eval",
    slug: "eval",
    type: "comparison",
    state: "created",
    workflowId: null,
    durationMs: null,
    inputSchema: "{}",
    outputSchema: "{}",
  };

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  it("writes the evaluation and one row per prompt pointing at it", async () => {
    const evaluation = await repository.createWithPrompts(newEvaluation, [
      { promptId: 10, versionId: 100 },
      { promptId: 11, versionId: 110 },
    ]);

    const rows = await env.DB.prepare(
      "SELECT tenantId, projectId, evaluationId, promptId, versionId FROM EvaluationPrompts ORDER BY id"
    ).all();
    expect(rows.results).toEqual([
      { tenantId: 1, projectId: 1, evaluationId: evaluation.id, promptId: 10, versionId: 100 },
      { tenantId: 1, projectId: 1, evaluationId: evaluation.id, promptId: 11, versionId: 110 },
    ]);
  });

  it("writes nothing when a prompt row fails", async () => {
    await expect(
      repository.createWithPrompts(newEvaluation, [
        { promptId: 10, versionId: 100 },
        { promptId: null as unknown as number, versionId: 110 },
      ])
    ).rejects.toThrow();

    expect(await countRows("Evaluations")).toBe(0);
    expect(await countRows("EvaluationPrompts")).toBe(0);
  });
});
