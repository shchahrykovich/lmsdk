import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../../helpers/db-setup";

describe("EvaluationResults indexes", () => {
  beforeEach(async () => {
    await applyMigrations();
  });

  it("finds the results of one evaluation with an index that includes evaluationId", async () => {
    const { results } = await env.DB.prepare(
      'EXPLAIN QUERY PLAN SELECT * FROM "EvaluationResults" WHERE "tenantId" = 1 AND "projectId" = 2 AND "evaluationId" = 41'
    ).all<{ detail: string }>();

    expect(results.map((row) => row.detail).join(" ")).toContain("evaluationId=?");
  });
});
