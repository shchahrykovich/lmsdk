import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationComparisonRepository } from "../../../../../worker/evaluations/repositories/evaluation-comparison.repository";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { applyMigrations } from "../../../helpers/db-setup";

const evaluationOf = (tenantId: number, evaluationId = 1) => new EntityId(evaluationId, new ProjectId(1, tenantId, "user-1"));
const pair = { recordId: 5, leftVersionId: 100, rightVersionId: 101 };

const readRows = async () =>
  (await env.DB.prepare("SELECT tenantId, evaluationId, dataSetRecordId, leftVersionId, rightVersionId, description, score FROM EvaluationComparisons ORDER BY id").all()).results;

describe("EvaluationComparisonRepository", () => {
  let repository: EvaluationComparisonRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationComparisonRepository(env.DB);
  });

  it("creates a review, then replaces it for the same record and pair", async () => {
    await repository.upsert(evaluationOf(1), pair, { description: "Right is shorter", score: 1 });
    await repository.upsert(evaluationOf(1), pair, { description: null, score: -2 });

    expect(await readRows()).toEqual([
      { tenantId: 1, evaluationId: 1, dataSetRecordId: 5, leftVersionId: 100, rightVersionId: 101, description: null, score: -2 },
    ]);
  });

  it("keeps one review per pair, so the 3 pairs of 3 versions are stored apart", async () => {
    await repository.upsert(evaluationOf(1), { recordId: 5, leftVersionId: 100, rightVersionId: 101 }, { description: "a", score: 1 });
    await repository.upsert(evaluationOf(1), { recordId: 5, leftVersionId: 101, rightVersionId: 102 }, { description: "b", score: 0 });
    await repository.upsert(evaluationOf(1), { recordId: 5, leftVersionId: 100, rightVersionId: 102 }, { description: "c", score: -1 });

    expect(await readRows()).toHaveLength(3);
  });

  it("lists only the reviews of the given tenant and evaluation", async () => {
    await repository.upsert(evaluationOf(1), pair, { description: "mine", score: 1 });
    await repository.upsert(evaluationOf(1, 2), pair, { description: "other evaluation", score: 1 });
    await env.DB.prepare(
      `INSERT INTO EvaluationComparisons (tenantId, projectId, evaluationId, dataSetRecordId, leftVersionId, rightVersionId, description, score)
       VALUES (2, 1, 1, 6, 100, 101, 'other tenant', 2)`
    ).run();

    const rows = await repository.listByEvaluation(evaluationOf(1));

    expect(rows.map((row) => row.description)).toEqual(["mine"]);
  });
});
