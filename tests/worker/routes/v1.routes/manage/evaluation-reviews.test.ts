import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createWorkflowMock, manage, setupFixtures, type Fixtures } from "./helpers";

type EvaluationBody = {
  evaluation: { id: number; slug: string; summary: string | null; baseEvaluationId: number | null };
  prompts: { versionId: number; version: number }[];
  comparisons: { recordId: number; leftVersionId: number; rightVersionId: number; description: string | null; score: number | null }[];
};

describe("Manage API - evaluation summary, manual reviews and reused results", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
    await manage("/projects/support/prompts/classifier/versions", f.keys.write, { method: "POST", body: {} });
    await manage("/projects/support/datasets/tickets/records", f.keys.write, {
      method: "POST",
      body: { records: [{ ticket: "refund please" }] },
    });
  });

  const start = async (body: Record<string, unknown>) => {
    const res = await manage("/projects/support/evaluations", f.keys.write, { method: "POST", body, workflow: createWorkflowMock() });
    return { res, body: await res.json<EvaluationBody & { error?: string }>() };
  };

  const startComparison = () =>
    start({
      name: "v1 vs v2",
      dataset: "tickets",
      prompts: [
        { prompt: "classifier", version: 1 },
        { prompt: "classifier", version: 2 },
      ],
    });

  it("starts an evaluation that reuses the results of an earlier one, by slug", async () => {
    const base = await start({ name: "v1 only", dataset: "tickets", prompts: [{ prompt: "classifier", version: 1 }] });

    const { res, body } = await start({
      name: "v1 vs v2",
      dataset: "tickets",
      prompts: [
        { prompt: "classifier", version: 1 },
        { prompt: "classifier", version: 2 },
      ],
      reuseResultsFrom: "v1-only",
    });

    expect(res.status).toBe(201);
    expect(body.evaluation.baseEvaluationId).toBe(base.body.evaluation.id);
  });

  it("returns 404 when the evaluation to reuse does not exist", async () => {
    const { res } = await start({
      name: "v2",
      dataset: "tickets",
      prompts: [{ prompt: "classifier", version: 2 }],
      reuseResultsFrom: "missing",
    });

    expect(res.status).toBe(404);
  });

  it("sets and clears the summary", async () => {
    await startComparison();

    const saved = await manage("/projects/support/evaluations/v1-vs-v2", f.keys.write, {
      method: "PATCH",
      body: { summary: "v2 is shorter and as correct" },
    });
    expect(saved.status).toBe(200);
    expect((await saved.json<EvaluationBody>()).evaluation.summary).toBe("v2 is shorter and as correct");

    const cleared = await manage("/projects/support/evaluations/v1-vs-v2", f.keys.write, { method: "PATCH", body: { summary: null } });
    expect((await cleared.json<EvaluationBody>()).evaluation.summary).toBeNull();
  });

  it("saves a manual review and returns it with the results", async () => {
    await startComparison();
    const details = await (await manage("/projects/support/evaluations/v1-vs-v2", f.keys.read)).json<EvaluationBody>();
    const record = await env.DB.prepare("SELECT id FROM DataSetRecords WHERE tenantId = 1").first<{ id: number }>();
    const [left, right] = details.prompts;
    const review = { recordId: record!.id, leftVersionId: left.versionId, rightVersionId: right.versionId };

    const res = await manage("/projects/support/evaluations/v1-vs-v2/comparisons", f.keys.write, {
      method: "PUT",
      body: { ...review, description: "Right one is shorter", score: 1 },
    });
    const after = await (await manage("/projects/support/evaluations/v1-vs-v2", f.keys.read)).json<EvaluationBody>();

    expect(res.status).toBe(200);
    expect(after.comparisons).toEqual([expect.objectContaining({ ...review, description: "Right one is shorter", score: 1 })]);
  });

  it("returns 400 for a score outside -2..2 and writes nothing", async () => {
    await startComparison();

    const res = await manage("/projects/support/evaluations/v1-vs-v2/comparisons", f.keys.write, {
      method: "PUT",
      body: { recordId: 1, leftVersionId: 1, rightVersionId: 2, description: null, score: 5 },
    });
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM EvaluationComparisons").first<{ count: number }>();

    expect(res.status).toBe(400);
    expect(row?.count).toBe(0);
  });
});
