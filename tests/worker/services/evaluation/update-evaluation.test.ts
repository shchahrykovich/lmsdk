import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/services/evaluation.service";
import { EvaluationRepository } from "../../../../worker/repositories/evaluation.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("EvaluationService - update evaluation", () => {
  let evaluationService: EvaluationService;
  let evaluationRepository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    evaluationService = new EvaluationService(env.DB);
    evaluationRepository = new EvaluationRepository(env.DB);
  });

  it("should set workflow id for evaluation", async () => {
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

    const updated = await evaluationService.setWorkflowId(
      { tenantId: 1, projectId: 1 },
      evaluation.id,
      "workflow-123"
    );

    expect(updated.workflowId).toBe("workflow-123");

    const record = await env.DB.prepare(
      "SELECT workflowId FROM Evaluations WHERE id = ?"
    )
      .bind(evaluation.id)
      .first<{ workflowId: string | null }>();

    expect(record?.workflowId).toBe("workflow-123");
  });

  it("should mark evaluation as finished with duration", async () => {
    const evaluation = await evaluationRepository.create({
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

    const updated = await evaluationService.finishEvaluation(
      { tenantId: 1, projectId: 1 },
      evaluation.id,
      1234
    );

    expect(updated.state).toBe("finished");
    expect(updated.durationMs).toBe(1234);

    const record = await env.DB.prepare(
      "SELECT state, durationMs FROM Evaluations WHERE id = ?"
    )
      .bind(evaluation.id)
      .first<{ state: string; durationMs: number | null }>();

    expect(record?.state).toBe("finished");
    expect(record?.durationMs).toBe(1234);
  });

  it("should mark evaluation as running", async () => {
    const evaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval Running",
      slug: "eval-running",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const updated = await evaluationService.startEvaluation(
      { tenantId: 1, projectId: 1 },
      evaluation.id
    );

    expect(updated.state).toBe("running");

    const record = await env.DB.prepare(
      "SELECT state FROM Evaluations WHERE id = ?"
    )
      .bind(evaluation.id)
      .first<{ state: string }>();

    expect(record?.state).toBe("running");
  });

  it("should update output schema", async () => {
    const evaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval Output",
      slug: "eval-output",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const updated = await evaluationService.updateOutputSchema(
      { tenantId: 1, projectId: 1 },
      evaluation.id,
      "{\"fields\":{\"ok\":{\"type\":\"boolean\"}}}"
    );

    expect(updated.outputSchema).toBe("{\"fields\":{\"ok\":{\"type\":\"boolean\"}}}");

    const record = await env.DB.prepare(
      "SELECT outputSchema FROM Evaluations WHERE id = ?"
    )
      .bind(evaluation.id)
      .first<{ outputSchema: string }>();

    expect(record?.outputSchema).toBe("{\"fields\":{\"ok\":{\"type\":\"boolean\"}}}");
  });

  it("should preserve workflow id when finishing evaluation", async () => {
    const evaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval E",
      slug: "eval-e",
      type: "run",
      state: "created",
      workflowId: "workflow-keep",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const updated = await evaluationService.finishEvaluation(
      { tenantId: 1, projectId: 1 },
      evaluation.id,
      500
    );

    expect(updated.workflowId).toBe("workflow-keep");

    const record = await env.DB.prepare(
      "SELECT workflowId FROM Evaluations WHERE id = ?"
    )
      .bind(evaluation.id)
      .first<{ workflowId: string | null }>();

    expect(record?.workflowId).toBe("workflow-keep");
  });

  it("should enforce tenant scoping when setting workflow id", async () => {
    const evaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval C",
      slug: "eval-c",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await expect(
      evaluationService.setWorkflowId(
        { tenantId: 2, projectId: 1 },
        evaluation.id,
        "workflow-tenant"
      )
    ).rejects.toThrow("Evaluation not found");
  });

  it("should enforce tenant scoping when finishing evaluation", async () => {
    const evaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval D",
      slug: "eval-d",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await expect(
      evaluationService.finishEvaluation(
        { tenantId: 2, projectId: 1 },
        evaluation.id,
        100
      )
    ).rejects.toThrow("Evaluation not found");
  });

  it("should throw when setting workflow id for missing evaluation", async () => {
    await expect(
      evaluationService.setWorkflowId(
        { tenantId: 1, projectId: 1 },
        999,
        "workflow-404"
      )
    ).rejects.toThrow("Evaluation not found");
  });

  it("should throw when finishing missing evaluation", async () => {
    await expect(
      evaluationService.finishEvaluation({ tenantId: 1, projectId: 1 }, 999, 500)
    ).rejects.toThrow("Evaluation not found");
  });
});
