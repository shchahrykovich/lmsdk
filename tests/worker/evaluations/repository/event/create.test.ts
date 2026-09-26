import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationEventRepository } from "../../../../../worker/evaluations/repositories/evaluation-event.repository";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { applyMigrations } from "../../../helpers/db-setup";

describe("EvaluationEventRepository.create", () => {
  let repository: EvaluationEventRepository;
  const evaluationId = new EntityId(7, new ProjectId(2, 1, "user-1"));

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationEventRepository(env.DB);
  });

  it("stores a call event with its record, prompt, version and details", async () => {
    await repository.create(evaluationId, {
      type: "call_started",
      recordId: 11,
      promptId: 22,
      versionId: 202,
      details: { attempt: 2, provider: "openai", model: "gpt-6-luna" },
    });

    const row = await env.DB.prepare("SELECT * FROM EvaluationEvents").first<Record<string, unknown>>();
    expect(row).toMatchObject({
      tenantId: 1,
      projectId: 2,
      evaluationId: 7,
      type: "call_started",
      recordId: 11,
      promptId: 22,
      versionId: 202,
    });
    expect(JSON.parse(row!.details as string)).toEqual({ attempt: 2, provider: "openai", model: "gpt-6-luna" });
  });

  it("stores an evaluation event without call fields", async () => {
    await repository.create(evaluationId, { type: "started", details: { totalCalls: 20 } });

    const row = await env.DB.prepare("SELECT * FROM EvaluationEvents").first<Record<string, unknown>>();
    expect(row).toMatchObject({ type: "started", recordId: null, promptId: null, versionId: null, details: '{"totalCalls":20}' });
  });
});
