import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/services/evaluation.service";
import { applyMigrations } from "../../helpers/db-setup";

describe("EvaluationService.getEvaluationDetails", () => {
  let service: EvaluationService;

  beforeEach(async () => {
    await applyMigrations();
    service = new EvaluationService(env.DB);
  });

  it("should return evaluation details with prompts and results", async () => {
    // Create evaluation
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Test Eval', 'test-eval', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    // Create prompts and versions
    await env.DB
      .prepare(
        `INSERT INTO Prompts (id, tenantId, projectId, name, slug, provider, model, body, latestVersion, isActive)
         VALUES (10, 1, 1, 'JSON Prompt', 'json-prompt', 'openai', 'gpt-4', '{}', 1, 1)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO PromptVersions (id, promptId, tenantId, projectId, version, name, slug, provider, model, body)
         VALUES (100, 10, 1, 1, 1, 'JSON Prompt', 'json-prompt', 'openai', 'gpt-4', '{"messages":[],"response_format":{"type":"json"}}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO Prompts (id, tenantId, projectId, name, slug, provider, model, body, latestVersion, isActive)
         VALUES (11, 1, 1, 'Text Prompt', 'text-prompt', 'openai', 'gpt-4', '{}', 1, 1)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO PromptVersions (id, promptId, tenantId, projectId, version, name, slug, provider, model, body)
         VALUES (101, 11, 1, 1, 1, 'Text Prompt', 'text-prompt', 'openai', 'gpt-4', '{"messages":[]}')`
      )
      .run();

    // Create evaluation prompts
    await env.DB
      .prepare(
        `INSERT INTO EvaluationPrompts (tenantId, projectId, evaluationId, promptId, versionId)
         VALUES (1, 1, 1, 10, 100)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationPrompts (tenantId, projectId, evaluationId, promptId, versionId)
         VALUES (1, 1, 1, 11, 101)`
      )
      .run();

    // Create dataset and records
    await env.DB
      .prepare(
        `INSERT INTO DataSets (id, tenantId, projectId, name, slug, isDeleted)
         VALUES (1, 1, 1, 'Test Dataset', 'test-dataset', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (1, 1, 1, 1, '{"input":"test1"}', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (2, 1, 1, 1, '{"input":"test2"}', 0)`
      )
      .run();

    // Create results
    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (1, 1, 1, 1, 10, 100, '{"content":"result1"}', 500, '{"usage":{"tokens":10}}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (1, 1, 1, 1, 11, 101, '{"content":"result2"}', 600, '{"usage":{"tokens":20}}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (1, 1, 1, 2, 10, 100, '{"content":"result3"}', 550, '{"usage":{"tokens":15}}')`
      )
      .run();

    const details = await service.getEvaluationDetails(
      { tenantId: 1, projectId: 1 },
      1
    );

    expect(details).toBeDefined();
    expect(details!.evaluation).toMatchObject({
      id: 1,
      tenantId: 1,
      projectId: 1,
      name: "Test Eval",
      slug: "test-eval",
    });

    expect(details!.prompts).toHaveLength(2);
    expect(details!.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          promptId: 10,
          versionId: 100,
          promptName: "JSON Prompt",
          responseFormat: '{"type":"json"}',
        }),
        expect.objectContaining({
          promptId: 11,
          versionId: 101,
          promptName: "Text Prompt",
          responseFormat: null,
        }),
      ])
    );

    expect(details!.results).toHaveLength(2);

    // Check record 1 has 2 outputs
    const record1 = details!.results.find((r) => r.recordId === 1);
    expect(record1).toBeDefined();
    expect(record1!.variables).toBe('{"input":"test1"}');
    expect(record1!.outputs).toHaveLength(2);
    expect(record1!.outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          promptId: 10,
          versionId: 100,
          result: '{"content":"result1"}',
          durationMs: 500,
        }),
        expect.objectContaining({
          promptId: 11,
          versionId: 101,
          result: '{"content":"result2"}',
          durationMs: 600,
        }),
      ])
    );

    // Check record 2 has 1 output
    const record2 = details!.results.find((r) => r.recordId === 2);
    expect(record2).toBeDefined();
    expect(record2!.variables).toBe('{"input":"test2"}');
    expect(record2!.outputs).toHaveLength(1);
    expect(record2!.outputs[0]).toMatchObject({
      promptId: 10,
      versionId: 100,
      result: '{"content":"result3"}',
      durationMs: 550,
    });
  });

  it("should return null when evaluation does not exist", async () => {
    const details = await service.getEvaluationDetails(
      { tenantId: 1, projectId: 1 },
      999
    );

    expect(details).toBeNull();
  });

  it("should return empty results when no results exist", async () => {
    // Create evaluation with no results
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Test Eval', 'test-eval', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationPrompts (tenantId, projectId, evaluationId, promptId, versionId)
         VALUES (1, 1, 1, 10, 100)`
      )
      .run();

    const details = await service.getEvaluationDetails(
      { tenantId: 1, projectId: 1 },
      1
    );

    expect(details).toBeDefined();
    expect(details!.evaluation.id).toBe(1);
    expect(details!.prompts).toHaveLength(1);
    expect(details!.results).toHaveLength(0);
  });

  it("should filter by tenantId to prevent cross-tenant access", async () => {
    // Create evaluations for different tenants
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Tenant 1 Eval', 'tenant-1-eval', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (2, 2, 1, 1, 'Tenant 2 Eval', 'tenant-2-eval', 'run', 'finished', 'workflow-2', 1000, '{}', '{}')`
      )
      .run();

    // Tenant 1 should not see tenant 2's evaluation
    const details = await service.getEvaluationDetails(
      { tenantId: 1, projectId: 1 },
      2
    );

    expect(details).toBeNull();
  });

  it("should filter by projectId to prevent cross-project access", async () => {
    // Create evaluations for different projects
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Project 1 Eval', 'project-1-eval', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (2, 1, 2, 1, 'Project 2 Eval', 'project-2-eval', 'run', 'finished', 'workflow-2', 1000, '{}', '{}')`
      )
      .run();

    // Project 1 should not see project 2's evaluation
    const details = await service.getEvaluationDetails(
      { tenantId: 1, projectId: 1 },
      2
    );

    expect(details).toBeNull();
  });

  it("should only return results for the specified evaluation", async () => {
    // Create two evaluations
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Eval 1', 'eval-1', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (2, 1, 1, 1, 'Eval 2', 'eval-2', 'run', 'finished', 'workflow-2', 1000, '{}', '{}')`
      )
      .run();

    // Create dataset and records
    await env.DB
      .prepare(
        `INSERT INTO DataSets (id, tenantId, projectId, name, slug, isDeleted)
         VALUES (1, 1, 1, 'Test Dataset', 'test-dataset', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (1, 1, 1, 1, '{"input":"test"}', 0)`
      )
      .run();

    // Create results for both evaluations
    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (1, 1, 1, 1, 10, 100, '{"content":"result1"}', 500, '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (1, 1, 2, 1, 10, 100, '{"content":"result2"}', 500, '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationPrompts (tenantId, projectId, evaluationId, promptId, versionId)
         VALUES (1, 1, 1, 10, 100)`
      )
      .run();

    const details = await service.getEvaluationDetails(
      { tenantId: 1, projectId: 1 },
      1
    );

    expect(details).toBeDefined();
    expect(details!.results).toHaveLength(1);
    expect(details!.results[0].outputs[0].result).toBe('{"content":"result1"}');
  });

  it("should handle deleted dataset records correctly", async () => {
    // Create evaluation
    await env.DB
      .prepare(
        `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, workflowId, durationMs, inputSchema, outputSchema)
         VALUES (1, 1, 1, 1, 'Test Eval', 'test-eval', 'run', 'finished', 'workflow-1', 1000, '{}', '{}')`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO EvaluationPrompts (tenantId, projectId, evaluationId, promptId, versionId)
         VALUES (1, 1, 1, 10, 100)`
      )
      .run();

    // Create dataset with deleted record
    await env.DB
      .prepare(
        `INSERT INTO DataSets (id, tenantId, projectId, name, slug, isDeleted)
         VALUES (1, 1, 1, 'Test Dataset', 'test-dataset', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (1, 1, 1, 1, '{"input":"test"}', 1)`
      )
      .run();

    // Create result for deleted record
    await env.DB
      .prepare(
        `INSERT INTO EvaluationResults (tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
         VALUES (1, 1, 1, 1, 10, 100, '{"content":"result"}', 500, '{}')`
      )
      .run();

    const details = await service.getEvaluationDetails(
      { tenantId: 1, projectId: 1 },
      1
    );

    expect(details).toBeDefined();
    // Should not include results for deleted records
    expect(details!.results).toHaveLength(0);
  });
});
