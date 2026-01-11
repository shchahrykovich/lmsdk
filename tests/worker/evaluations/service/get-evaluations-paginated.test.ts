import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/evaluations/evaluation.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Evaluation } from "../../../../worker/db/schema";
import { ProjectId } from "../../../../worker/shared/project-id";

describe("EvaluationService - getEvaluationsPaginated", () => {
  let evaluationService: EvaluationService;

  beforeEach(async () => {
    await applyMigrations();
    evaluationService = new EvaluationService(env.DB);
  });

  const mockProjectId = (projectId: number, tenantId: number): ProjectId =>
    new ProjectId(projectId, tenantId, "test-user");

  const insertEvaluation = (evaluation: Evaluation) =>
    env.DB.prepare(
      `INSERT INTO Evaluations
      (tenantId, projectId, name, slug, type, state, durationMs, inputSchema, outputSchema, datasetId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        evaluation.outputSchema,
        evaluation.datasetId ?? null
      )
      .run();

  const insertDataset = (tenantId: number, projectId: number, id: number, name: string) =>
    env.DB.prepare(
      `INSERT INTO DataSets (id, tenantId, projectId, name, slug, schema)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(id, tenantId, projectId, name, `dataset-${id}`, "{}")
      .run();

  it("should return paginated evaluations with correct metadata", async () => {
    // Create 5 evaluations
    for (let i = 1; i <= 5; i++) {
      await insertEvaluation({
        id: i,
        tenantId: 1,
        projectId: 1,
        name: `Eval ${i}`,
        slug: `eval-${i}`,
        type: "run",
        state: "created",
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
        createdAt: 0,
        updatedAt: 0,
      });
    }

    const result = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      1,
      2
    );

    expect(result.evaluations).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.totalPages).toBe(3);
  });

  it("should return correct page of evaluations", async () => {
    // Create 5 evaluations
    for (let i = 1; i <= 5; i++) {
      await insertEvaluation({
        id: i,
        tenantId: 1,
        projectId: 1,
        name: `Eval ${i}`,
        slug: `eval-${i}`,
        type: "run",
        state: "created",
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
        createdAt: 0,
        updatedAt: 0,
      });
    }

    // First page
    const page1 = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      1,
      2
    );

    expect(page1.evaluations).toHaveLength(2);
    // Verify correct tenant/project
    expect(page1.evaluations.every((e) => e.tenantId === 1 && e.projectId === 1)).toBe(true);

    // Second page
    const page2 = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      2,
      2
    );

    expect(page2.evaluations).toHaveLength(2);
    expect(page2.evaluations.every((e) => e.tenantId === 1 && e.projectId === 1)).toBe(true);

    // Third page
    const page3 = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      3,
      2
    );

    expect(page3.evaluations).toHaveLength(1);
    expect(page3.evaluations.every((e) => e.tenantId === 1 && e.projectId === 1)).toBe(true);
  });

  it("should include dataset names in results", async () => {
    // Create a dataset
    await insertDataset(1, 1, 1, "Test Dataset");

    // Create evaluation with dataset
    await insertEvaluation({
      id: 1,
      tenantId: 1,
      projectId: 1,
      name: "Eval with Dataset",
      slug: "eval-with-dataset",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
      datasetId: 1,
      createdAt: 0,
      updatedAt: 0,
    });

    // Create evaluation without dataset
    await insertEvaluation({
      id: 2,
      tenantId: 1,
      projectId: 1,
      name: "Eval without Dataset",
      slug: "eval-without-dataset",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
      createdAt: 0,
      updatedAt: 0,
    });

    const result = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      1,
      10
    );

    expect(result.evaluations).toHaveLength(2);
    // Find the evaluations by name since order might vary
    const withDataset = result.evaluations.find((e) => e.name === "Eval with Dataset");
    const withoutDataset = result.evaluations.find((e) => e.name === "Eval without Dataset");

    expect(withDataset).toBeDefined();
    expect(withDataset?.datasetName).toBe("Test Dataset");
    expect(withoutDataset).toBeDefined();
    expect(withoutDataset?.datasetName).toBeNull();
  });

  it("should enforce cross-tenant protection", async () => {
    // Create evaluations for tenant 1
    for (let i = 1; i <= 3; i++) {
      await insertEvaluation({
        id: i,
        tenantId: 1,
        projectId: 1,
        name: `Tenant 1 Eval ${i}`,
        slug: `tenant-1-eval-${i}`,
        type: "run",
        state: "created",
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
        createdAt: 0,
        updatedAt: 0,
      });
    }

    // Create evaluations for tenant 2
    for (let i = 4; i <= 5; i++) {
      await insertEvaluation({
        id: i,
        tenantId: 2,
        projectId: 1,
        name: `Tenant 2 Eval ${i}`,
        slug: `tenant-2-eval-${i}`,
        type: "run",
        state: "created",
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
        createdAt: 0,
        updatedAt: 0,
      });
    }

    const tenant1Result = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      1,
      10
    );

    expect(tenant1Result.total).toBe(3);
    expect(tenant1Result.evaluations).toHaveLength(3);
    expect(tenant1Result.evaluations.every((e) => e.name.startsWith("Tenant 1"))).toBe(true);

    const tenant2Result = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 2),
      1,
      10
    );

    expect(tenant2Result.total).toBe(2);
    expect(tenant2Result.evaluations).toHaveLength(2);
    expect(tenant2Result.evaluations.every((e) => e.name.startsWith("Tenant 2"))).toBe(true);
  });

  it("should calculate totalPages correctly", async () => {
    // Create 10 evaluations
    for (let i = 1; i <= 10; i++) {
      await insertEvaluation({
        id: i,
        tenantId: 1,
        projectId: 1,
        name: `Eval ${i}`,
        slug: `eval-${i}`,
        type: "run",
        state: "created",
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
        createdAt: 0,
        updatedAt: 0,
      });
    }

    // Test pageSize 3: 10 items / 3 = 4 pages
    const result3 = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      1,
      3
    );
    expect(result3.totalPages).toBe(4);

    // Test pageSize 5: 10 items / 5 = 2 pages
    const result5 = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      1,
      5
    );
    expect(result5.totalPages).toBe(2);

    // Test pageSize 10: 10 items / 10 = 1 page
    const result10 = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      1,
      10
    );
    expect(result10.totalPages).toBe(1);

    // Test pageSize 100: 10 items / 100 = 1 page
    const result100 = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      1,
      100
    );
    expect(result100.totalPages).toBe(1);
  });

  it("should return empty array for non-existent tenant/project", async () => {
    await insertEvaluation({
      id: 1,
      tenantId: 1,
      projectId: 1,
      name: "Eval",
      slug: "eval",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
      createdAt: 0,
      updatedAt: 0,
    });

    const result = await evaluationService.getEvaluationsPaginated(
      mockProjectId(999, 999),
      1,
      10
    );

    expect(result.evaluations).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it("should handle empty prompts array", async () => {
    await insertEvaluation({
      id: 1,
      tenantId: 1,
      projectId: 1,
      name: "Eval without Prompts",
      slug: "eval-no-prompts",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
      createdAt: 0,
      updatedAt: 0,
    });

    const result = await evaluationService.getEvaluationsPaginated(
      mockProjectId(1, 1),
      1,
      10
    );

    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0].prompts).toEqual([]);
  });
});
