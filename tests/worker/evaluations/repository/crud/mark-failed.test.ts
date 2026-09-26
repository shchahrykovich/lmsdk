import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../../worker/evaluations/repositories/evaluation.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";

describe("EvaluationRepository.markFailed", () => {
  let repository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  const createRunning = (tenantId: number) =>
    repository.create({
      tenantId,
      projectId: 1,
      name: `Eval ${tenantId}`,
      slug: `eval-${tenantId}`,
      type: "run",
      state: "running",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

  const stateOf = async (id: number) =>
    (await env.DB.prepare("SELECT state, durationMs FROM Evaluations WHERE id = ?").bind(id).first<{ state: string; durationMs: number | null }>());

  it("marks the evaluation failed with its duration", async () => {
    const created = await createRunning(1);

    await repository.markFailed(new EntityId(created.id, new ProjectId(1, 1, "user-1")), 312000);

    expect(await stateOf(created.id)).toEqual({ state: "failed", durationMs: 312000 });
  });

  it("does not change an evaluation of another tenant", async () => {
    const other = await createRunning(2);

    const updated = await repository.markFailed(new EntityId(other.id, new ProjectId(1, 1, "user-1")), 312000);

    expect(updated).toBeUndefined();
    expect(await stateOf(other.id)).toEqual({ state: "running", durationMs: null });
  });
});
