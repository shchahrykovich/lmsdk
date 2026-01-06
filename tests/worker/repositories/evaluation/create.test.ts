import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../worker/repositories/evaluation.repository";
import { applyMigrations } from "../../helpers/db-setup";
import type { Evaluation } from "../../../../worker/db/schema";

describe("EvaluationRepository - create", () => {
  let repository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  it("should create an evaluation and persist it", async () => {
    const evaluation = await repository.create({
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

    expect(evaluation.id).toBeDefined();
    expect(evaluation.tenantId).toBe(1);
    expect(evaluation.projectId).toBe(1);
    expect(evaluation.datasetId).toBe(5);
    expect(evaluation.name).toBe("Test Evaluation");
    expect(evaluation.slug).toBe("test-evaluation");
    expect(evaluation.type).toBe("run");
    expect(evaluation.state).toBe("created");
    expect(evaluation.inputSchema).toBe("{}");
    expect(evaluation.outputSchema).toBe("{}");

    const stored = await env.DB.prepare(
      "SELECT * FROM Evaluations WHERE id = ?"
    )
      .bind(evaluation.id)
      .first<Evaluation>();

    expect(stored).toBeDefined();
    expect(stored?.name).toBe("Test Evaluation");
    expect(stored?.datasetId).toBe(5);
  });
});
