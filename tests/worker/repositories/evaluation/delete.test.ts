import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../worker/repositories/evaluation.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("EvaluationRepository - delete", () => {
  let repository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  it("should delete evaluation and return it", async () => {
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

    const deleted = await repository.delete({
      tenantId: 1,
      projectId: 1,
      evaluationId: created.id,
    });

    expect(deleted).toBeDefined();
    expect(deleted?.id).toBe(created.id);
    expect(deleted?.name).toBe("Test Eval");

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Evaluations WHERE id = ?"
    )
      .bind(created.id)
      .first<{ count: number }>();

    expect(result?.count).toBe(0);
  });

  it("should return undefined when evaluation does not match tenant", async () => {
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

    const deleted = await repository.delete({
      tenantId: 2,
      projectId: 1,
      evaluationId: created.id,
    });

    expect(deleted).toBeUndefined();

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Evaluations WHERE id = ? AND tenantId = ?"
    )
      .bind(created.id, 1)
      .first<{ count: number }>();

    expect(result?.count).toBe(1);
  });

  it("should return undefined when evaluation does not match project", async () => {
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

    const deleted = await repository.delete({
      tenantId: 1,
      projectId: 2,
      evaluationId: created.id,
    });

    expect(deleted).toBeUndefined();

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Evaluations WHERE id = ? AND projectId = ?"
    )
      .bind(created.id, 1)
      .first<{ count: number }>();

    expect(result?.count).toBe(1);
  });

  it("should return undefined when evaluation does not exist", async () => {
    const deleted = await repository.delete({
      tenantId: 1,
      projectId: 1,
      evaluationId: 99999,
    });

    expect(deleted).toBeUndefined();
  });
});
