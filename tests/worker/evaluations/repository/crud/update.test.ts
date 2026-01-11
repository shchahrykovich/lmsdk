import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../../worker/evaluations/evaluation.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";

describe("EvaluationRepository - update", () => {
  let repository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  it("should update workflow id for evaluation", async () => {
    const created = await repository.create({
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

    const projectId = new ProjectId(1, 1, "user-1");
    const entityId = new EntityId(created.id, projectId);
    const updated = await repository.updateWorkflowId(entityId, "workflow-123");

    expect(updated?.workflowId).toBe("workflow-123");

    const record = await env.DB.prepare(
      "SELECT workflowId FROM Evaluations WHERE id = ?"
    )
      .bind(created.id)
      .first<{ workflowId: string | null }>();

    expect(record?.workflowId).toBe("workflow-123");
  });

  it("should mark evaluation as finished with duration", async () => {
    const created = await repository.create({
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

    const projectId = new ProjectId(1, 1, "user-1");
    const entityId = new EntityId(created.id, projectId);
    const updated = await repository.markFinished(entityId, 2500);

    expect(updated?.state).toBe("finished");
    expect(updated?.durationMs).toBe(2500);

    const record = await env.DB.prepare(
      "SELECT state, durationMs FROM Evaluations WHERE id = ?"
    )
      .bind(created.id)
      .first<{ state: string; durationMs: number | null }>();

    expect(record?.state).toBe("finished");
    expect(record?.durationMs).toBe(2500);
  });

  it("should mark evaluation as running", async () => {
    const created = await repository.create({
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

    const projectId = new ProjectId(1, 1, "user-1");
    const entityId = new EntityId(created.id, projectId);
    const updated = await repository.markRunning(entityId);

    expect(updated?.state).toBe("running");

    const record = await env.DB.prepare(
      "SELECT state FROM Evaluations WHERE id = ?"
    )
      .bind(created.id)
      .first<{ state: string }>();

    expect(record?.state).toBe("running");
  });

  it("should update output schema", async () => {
    const created = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval Schema",
      slug: "eval-schema",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const projectId = new ProjectId(1, 1, "user-1");
    const entityId = new EntityId(created.id, projectId);
    const updated = await repository.updateOutputSchema(entityId, "{\"fields\":{\"score\":{\"type\":\"number\"}}}");

    expect(updated?.outputSchema).toBe("{\"fields\":{\"score\":{\"type\":\"number\"}}}");

    const record = await env.DB.prepare(
      "SELECT outputSchema FROM Evaluations WHERE id = ?"
    )
      .bind(created.id)
      .first<{ outputSchema: string }>();

    expect(record?.outputSchema).toBe("{\"fields\":{\"score\":{\"type\":\"number\"}}}");
  });
});
