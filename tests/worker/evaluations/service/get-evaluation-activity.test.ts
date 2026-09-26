import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/evaluations/evaluation.service";
import { applyMigrations } from "../../helpers/db-setup";
import { EntityId } from "../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../worker/shared/project-id";

const evaluationOf = (tenantId: number) => new EntityId(1, new ProjectId(1, tenantId, "test-user"));

const insertEvent = (id: number, type: string, createdAt: number, details = "{}") =>
  env.DB.prepare(
    `INSERT INTO EvaluationEvents (id, tenantId, projectId, evaluationId, type, recordId, promptId, versionId, details, createdAt)
     VALUES (?, 1, 1, 1, ?, 5, 10, 100, ?, ?)`
  ).bind(id, type, details, createdAt).run();

describe("EvaluationService.getEvaluationActivity", () => {
  let service: EvaluationService;

  beforeEach(async () => {
    await applyMigrations();
    service = new EvaluationService(env.DB);
    await env.DB.prepare(
      `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, inputSchema, outputSchema)
       VALUES (1, 1, 1, 8, 'Eval', 'eval', 'comparison', 'running', '{}', '{}')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO EvaluationPrompts (tenantId, projectId, evaluationId, promptId, versionId) VALUES (1, 1, 1, 10, 100), (1, 1, 1, 10, 101)`
    ).run();
    await env.DB.prepare(
      `INSERT INTO DataSetRecords (tenantId, projectId, dataSetId, variables) VALUES (1, 1, 8, '{}'), (1, 1, 8, '{}'), (1, 1, 8, '{}')`
    ).run();
  });

  it("returns the newest events and the progress of the calls", async () => {
    await insertEvent(1, "started", 1790423020, '{"totalCalls":6}');
    await insertEvent(2, "call_started", 1790423021, '{"attempt":1,"provider":"openai","model":"gpt-6-luna"}');
    await insertEvent(3, "call_failed", 1790423022, '{"attempt":1,"error":"400 Invalid value"}');
    await insertEvent(4, "call_started", 1790423032, '{"attempt":2}');

    const activity = await service.getEvaluationActivity(evaluationOf(1));

    expect(activity?.events.map((event) => event.type)).toEqual(["call_started", "call_failed", "call_started", "started"]);
    expect(activity?.events[1]).toMatchObject({ recordId: 5, promptId: 10, versionId: 100, details: { attempt: 1, error: "400 Invalid value" } });
    expect(activity?.progress).toEqual({
      totalCalls: 6,
      succeededCalls: 0,
      sentAttempts: 2,
      failedAttempts: 1,
      lastEventAt: new Date(1790423032 * 1000),
    });
  });

  it("returns empty progress before the workflow writes any event", async () => {
    const activity = await service.getEvaluationActivity(evaluationOf(1));

    expect(activity).toEqual({
      events: [],
      progress: { totalCalls: 6, succeededCalls: 0, sentAttempts: 0, failedAttempts: 0, lastEventAt: null },
    });
  });

  it("returns undefined for an evaluation of another tenant", async () => {
    await insertEvent(1, "started", 1790423020);

    expect(await service.getEvaluationActivity(evaluationOf(2))).toBeUndefined();
  });
});

describe("EvaluationService.failEvaluation", () => {
  it("marks the evaluation failed and records the reason as an event", async () => {
    await applyMigrations();
    await env.DB.prepare(
      `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, inputSchema, outputSchema)
       VALUES (1, 1, 1, 8, 'Eval', 'eval', 'run', 'running', '{}', '{}')`
    ).run();

    await new EvaluationService(env.DB).failEvaluation(evaluationOf(1), 312000, "400 Invalid value: 'disabled'");

    const evaluation = await env.DB.prepare("SELECT state, durationMs FROM Evaluations WHERE id = 1").first();
    const event = await env.DB.prepare("SELECT type, details FROM EvaluationEvents").first();
    expect(evaluation).toEqual({ state: "failed", durationMs: 312000 });
    expect(event).toEqual({ type: "failed", details: JSON.stringify({ error: "400 Invalid value: 'disabled'", durationMs: 312000 }) });
  });
});
