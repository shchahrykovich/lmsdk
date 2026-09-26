import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationEventRepository } from "../../../../../worker/evaluations/repositories/evaluation-event.repository";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { applyMigrations } from "../../../helpers/db-setup";

const insertEvent = (id: number, tenantId: number, projectId: number, evaluationId: number, type: string) =>
  env.DB.prepare(
    `INSERT INTO EvaluationEvents (id, tenantId, projectId, evaluationId, type, details) VALUES (?, ?, ?, ?, ?, '{}')`
  ).bind(id, tenantId, projectId, evaluationId, type).run();

describe("EvaluationEventRepository.listLatest", () => {
  let repository: EvaluationEventRepository;
  const evaluationId = new EntityId(7, new ProjectId(2, 1, "user-1"));

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationEventRepository(env.DB);
  });

  it("returns the newest events first, up to the limit", async () => {
    await insertEvent(1, 1, 2, 7, "started");
    await insertEvent(2, 1, 2, 7, "call_started");
    await insertEvent(3, 1, 2, 7, "call_succeeded");

    const events = await repository.listLatest(evaluationId, 2);

    expect(events.map((event) => event.id)).toEqual([3, 2]);
  });

  it("does not return events of another tenant, project or evaluation", async () => {
    await insertEvent(1, 2, 2, 7, "started");
    await insertEvent(2, 1, 3, 7, "started");
    await insertEvent(3, 1, 2, 8, "started");

    expect(await repository.listLatest(evaluationId, 10)).toEqual([]);
  });
});

describe("EvaluationEventRepository counts", () => {
  let repository: EvaluationEventRepository;
  const evaluationId = new EntityId(7, new ProjectId(2, 1, "user-1"));

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationEventRepository(env.DB);
  });

  it("counts events by type for one evaluation only", async () => {
    await insertEvent(1, 1, 2, 7, "call_started");
    await insertEvent(2, 1, 2, 7, "call_started");
    await insertEvent(3, 1, 2, 7, "call_failed");
    await insertEvent(4, 2, 2, 7, "call_started");

    expect(await repository.countByType(evaluationId)).toEqual({ call_started: 2, call_failed: 1 });
  });

  it("counts the earlier sends of one call to number the attempts", async () => {
    const insertCall = (id: number, tenantId: number, recordId: number, versionId: number) =>
      env.DB.prepare(
        `INSERT INTO EvaluationEvents (id, tenantId, projectId, evaluationId, type, recordId, promptId, versionId, details)
         VALUES (?, ?, 2, 7, 'call_started', ?, 22, ?, '{}')`
      ).bind(id, tenantId, recordId, versionId).run();
    await insertCall(1, 1, 11, 202);
    await insertCall(2, 1, 11, 202);
    await insertCall(3, 1, 11, 201);
    await insertCall(4, 1, 12, 202);
    await insertCall(5, 2, 11, 202);

    expect(await repository.countCallStarts(evaluationId, { recordId: 11, versionId: 202 })).toBe(2);
  });
});
