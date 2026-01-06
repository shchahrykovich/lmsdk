import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../worker/repositories/evaluation.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("EvaluationRepository - findById", () => {
  let repository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  it("should find evaluation by id for tenant and project", async () => {
    const created = await repository.create({
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Test Eval",
      slug: "test-eval",
      type: "run",
      state: "created",
      workflowId: null,
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const evaluation = await repository.findById({
      tenantId: 1,
      projectId: 1,
      evaluationId: created.id,
    });

    expect(evaluation).toBeDefined();
    expect(evaluation?.id).toBe(created.id);
    expect(evaluation?.name).toBe("Test Eval");
    expect(evaluation?.datasetId).toBe(5);
  });

  it("should return undefined when id does not match tenant", async () => {
    const created = await repository.create({
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Tenant 1 Eval",
      slug: "tenant-1-eval",
      type: "run",
      state: "created",
      workflowId: null,
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const evaluation = await repository.findById({
      tenantId: 2,
      projectId: 1,
      evaluationId: created.id,
    });

    expect(evaluation).toBeUndefined();
  });

  it("should return undefined when id does not match project", async () => {
    const created = await repository.create({
      tenantId: 1,
      projectId: 1,
      datasetId: 5,
      name: "Project 1 Eval",
      slug: "project-1-eval",
      type: "run",
      state: "created",
      workflowId: null,
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const evaluation = await repository.findById({
      tenantId: 1,
      projectId: 2,
      evaluationId: created.id,
    });

    expect(evaluation).toBeUndefined();
  });

  it("should return undefined when evaluation does not exist", async () => {
    const evaluation = await repository.findById({
      tenantId: 1,
      projectId: 1,
      evaluationId: 99999,
    });

    expect(evaluation).toBeUndefined();
  });
});
