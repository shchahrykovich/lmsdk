import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../../worker/evaluations/evaluation.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";

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

    const projectId = new ProjectId(1, 1, "user-1");
    const entityId = new EntityId(created.id, projectId);
    const deleted = await repository.delete(entityId);

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

    const projectId = new ProjectId(1, 2, "user-2");
    const entityId = new EntityId(created.id, projectId);
    const deleted = await repository.delete(entityId);

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

    const projectId = new ProjectId(2, 1, "user-1");
    const entityId = new EntityId(created.id, projectId);
    const deleted = await repository.delete(entityId);

    expect(deleted).toBeUndefined();

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Evaluations WHERE id = ? AND projectId = ?"
    )
      .bind(created.id, 1)
      .first<{ count: number }>();

    expect(result?.count).toBe(1);
  });

  it("should return undefined when evaluation does not exist", async () => {
    const projectId = new ProjectId(1, 1, "user-1");
    const entityId = new EntityId(99999, projectId);
    const deleted = await repository.delete(entityId);

    expect(deleted).toBeUndefined();
  });
});
