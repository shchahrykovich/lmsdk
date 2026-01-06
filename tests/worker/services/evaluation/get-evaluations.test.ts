import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/services/evaluation.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Evaluation } from "../../../../worker/db/schema";

describe("EvaluationService - getEvaluations", () => {
  let evaluationService: EvaluationService;

  beforeEach(async () => {
    await applyMigrations();
    evaluationService = new EvaluationService(env.DB);
  });

  it("should return evaluations for tenant and project", async () => {
    const insert = (evaluation: Evaluation) =>
      env.DB.prepare(
        `INSERT INTO Evaluations
        (tenantId, projectId, name, slug, type, state, durationMs, inputSchema, outputSchema)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          evaluation.tenantId,
          evaluation.projectId,
          evaluation.name,
          evaluation.slug,
          evaluation.type,
          evaluation.state,
          evaluation.durationMs,
          evaluation.inputSchema,
          evaluation.outputSchema
        )
        .run();

    await insert({
      id: 1,
      tenantId: 1,
      projectId: 1,
      name: "Eval A",
      slug: "eval-a",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
      createdAt: 0,
      updatedAt: 0,
    });

    await insert({
      id: 2,
      tenantId: 1,
      projectId: 2,
      name: "Eval B",
      slug: "eval-b",
      type: "comparison",
      state: "running",
      durationMs: 1200,
      inputSchema: "{}",
      outputSchema: "{}",
      createdAt: 0,
      updatedAt: 0,
    });

    const evaluations = await evaluationService.getEvaluations({
      tenantId: 1,
      projectId: 1,
    });

    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].name).toBe("Eval A");
  });
});
