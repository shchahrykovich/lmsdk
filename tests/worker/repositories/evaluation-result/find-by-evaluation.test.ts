import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationResultRepository } from "../../../../worker/repositories/evaluation-result.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("EvaluationResultRepository.findByEvaluation", () => {
  let repository: EvaluationResultRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationResultRepository(env.DB);
  });

  it("should return all results for a specific evaluation", async () => {
    // Create test data
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Test Eval', 'test-eval', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (id, tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (1, 1, 1, 1, 1, 10, 100, '{"content":"result1"}', 500, '{"usage":{"tokens":10}}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (id, tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (2, 1, 1, 1, 2, 11, 101, '{"content":"result2"}', 600, '{"usage":{"tokens":20}}')`
      )
      .run();

    const results = await repository.findByEvaluation({
      tenantId: 1,
      projectId: 1,
      evaluationId: 1,
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      tenantId: 1,
      projectId: 1,
      evaluationId: 1,
      dataSetRecordId: 1,
      promptId: 10,
      versionId: 100,
      result: '{"content":"result1"}',
      durationMs: 500,
    });
    expect(results[1]).toMatchObject({
      tenantId: 1,
      projectId: 1,
      evaluationId: 1,
      dataSetRecordId: 2,
      promptId: 11,
      versionId: 101,
      result: '{"content":"result2"}',
      durationMs: 600,
    });
  });

  it("should return empty array when no results exist for evaluation", async () => {
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Test Eval', 'test-eval', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    const results = await repository.findByEvaluation({
      tenantId: 1,
      projectId: 1,
      evaluationId: 1,
    });

    expect(results).toHaveLength(0);
  });

  it("should filter by tenantId to prevent cross-tenant access", async () => {
    // Create evaluation and results for tenant 1
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Test Eval', 'test-eval', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (id, tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (1, 1, 1, 1, 1, 10, 100, '{"content":"result1"}', 500, '{"usage":{"tokens":10}}')`
      )
      .run();

    // Create evaluation and results for tenant 2
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (2, 2, 1, 1, 'Test Eval 2', 'test-eval-2', 'run', 'finished', 'workflow-2', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (id, tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (2, 2, 1, 2, 1, 10, 100, '{"content":"result2"}', 500, '{"usage":{"tokens":10}}')`
      )
      .run();

    // Tenant 1 should only see their own results
    const results = await repository.findByEvaluation({
      tenantId: 1,
      projectId: 1,
      evaluationId: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].tenantId).toBe(1);
  });

  it("should filter by projectId to prevent cross-project access", async () => {
    // Create evaluation and results for project 1
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Test Eval', 'test-eval', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (id, tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (1, 1, 1, 1, 1, 10, 100, '{"content":"result1"}', 500, '{"usage":{"tokens":10}}')`
      )
      .run();

    // Create evaluation and results for project 2
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (2, 1, 2, 1, 'Test Eval 2', 'test-eval-2', 'run', 'finished', 'workflow-2', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (id, tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (2, 1, 2, 2, 1, 10, 100, '{"content":"result2"}', 500, '{"usage":{"tokens":10}}')`
      )
      .run();

    // Project 1 should only see their own results
    const results = await repository.findByEvaluation({
      tenantId: 1,
      projectId: 1,
      evaluationId: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].projectId).toBe(1);
  });

  it("should filter by evaluationId to return only results for that evaluation", async () => {
    // Create two evaluations with results
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Test Eval 1', 'test-eval-1', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (2, 1, 1, 1, 'Test Eval 2', 'test-eval-2', 'run', 'finished', 'workflow-2', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (id, tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (1, 1, 1, 1, 1, 10, 100, '{"content":"result1"}', 500, '{"usage":{"tokens":10}}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (id, tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (2, 1, 1, 2, 1, 10, 100, '{"content":"result2"}', 500, '{"usage":{"tokens":10}}')`
      )
      .run();

    // Should only return results for evaluation 1
    const results = await repository.findByEvaluation({
      tenantId: 1,
      projectId: 1,
      evaluationId: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].evaluationId).toBe(1);
  });
});
