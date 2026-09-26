import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createWorkflowMock, manage, setupFixtures, type Fixtures } from "./helpers";

type EvaluationResponse = { evaluation: { id: number; slug: string; type: string; state: string; workflowId: string | null } };

describe("Manage API - evaluations", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
    await manage("/projects/support/prompts/classifier/versions", f.keys.write, { method: "POST", body: {} });
  });

  const start = (body: Record<string, unknown>, workflow = createWorkflowMock()) =>
    manage("/projects/support/evaluations", f.keys.write, { method: "POST", body, workflow });

  it("starts a comparison by slugs and version numbers and starts the workflow", async () => {
    const workflow = createWorkflowMock();

    const res = await start(
      {
        name: "v1 vs v2",
        dataset: "tickets",
        prompts: [
          { prompt: "classifier", version: 1 },
          { prompt: "classifier", version: 2 },
        ],
      },
      workflow
    );
    const body = await res.json<EvaluationResponse>();
    const promptRows = await env.DB.prepare("SELECT versionId FROM EvaluationPrompts ORDER BY id").all<{ versionId: number }>();

    expect(res.status).toBe(201);
    expect(body.evaluation).toMatchObject({ type: "comparison", state: "created", workflowId: `wf-${body.evaluation.id}` });
    expect(workflow.create).toHaveBeenCalledWith({
      params: expect.objectContaining({ tenantId: 1, projectId: f.tenant1.project.id, evaluationId: body.evaluation.id }),
    });
    expect(promptRows.results.map((r) => r.versionId)).toHaveLength(2);
  });

  it("returns 400 for a version that does not exist and writes nothing", async () => {
    const res = await start({ name: "bad", dataset: "tickets", prompts: [{ prompt: "classifier", version: 7 }] });
    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM Evaluations").first<{ count: number }>();

    expect(res.status).toBe(400);
    expect(row?.count).toBe(0);
  });

  it("returns 404 for a dataset that does not exist", async () => {
    const res = await start({ name: "bad", dataset: "nope", prompts: [{ prompt: "classifier", version: 1 }] });

    expect(res.status).toBe(404);
  });

  it("returns 400 for more than 3 prompts", async () => {
    const prompt = { prompt: "classifier", version: 1 };

    const res = await start({ name: "many", dataset: "tickets", prompts: [prompt, prompt, prompt, prompt] });

    expect(res.status).toBe(400);
  });

  it("returns 409 for a duplicate name", async () => {
    const body = { name: "same", dataset: "tickets", prompts: [{ prompt: "classifier", version: 1 }] };
    await start(body);

    const res = await start(body);

    expect(res.status).toBe(409);
  });

  it("returns the evaluation with the workflow status, by slug and by id", async () => {
    const created = await start({ name: "Run one", dataset: "tickets", prompts: [{ prompt: "classifier", version: 1 }] });
    const { evaluation } = await created.json<EvaluationResponse>();

    const bySlug = await manage("/projects/support/evaluations/run-one", f.keys.read, { workflow: createWorkflowMock("errored") });
    const byId = await manage(`/projects/support/evaluations/${evaluation.id}`, f.keys.read);
    const body = await bySlug.json<{ workflowStatus: string; results: unknown[]; prompts: { version: number }[] }>();

    expect(bySlug.status).toBe(200);
    expect(body.workflowStatus).toBe("errored");
    expect(body.prompts).toEqual([expect.objectContaining({ version: 1 })]);
    expect(body.results).toEqual([]);
    expect((await byId.json<{ workflowStatus: string }>()).workflowStatus).toBe("running");
  });

  it("finds an evaluation whose slug is only digits by its slug", async () => {
    await start({ name: "2025", dataset: "tickets", prompts: [{ prompt: "classifier", version: 1 }] });

    const res = await manage("/projects/support/evaluations/2025", f.keys.read);

    expect(res.status).toBe(200);
    expect((await res.json<EvaluationResponse>()).evaluation.slug).toBe("2025");
  });

  it("starts the workflow on a retry after the first start failed", async () => {
    const failing = createWorkflowMock();
    failing.create.mockRejectedValueOnce(new Error("Workflows is unavailable"));
    const body = { name: "Retry me", dataset: "tickets", prompts: [{ prompt: "classifier", version: 1 }] };

    const first = await start(body, failing);
    const second = await start(body, failing);
    const rows = await env.DB.prepare("SELECT workflowId FROM Evaluations").all<{ workflowId: string | null }>();

    expect(first.status).toBe(500);
    expect(second.status).toBe(201);
    expect((await second.json<EvaluationResponse>()).evaluation.workflowId).toMatch(/^wf-/);
    expect(rows.results).toHaveLength(1);
    expect(failing.create).toHaveBeenCalledTimes(2);
  });

  it("returns 409 on a retry with the same name but a different definition", async () => {
    const failing = createWorkflowMock();
    failing.create.mockRejectedValueOnce(new Error("Workflows is unavailable"));
    await start({ name: "Changed", dataset: "tickets", prompts: [{ prompt: "classifier", version: 1 }] }, failing);

    const res = await start({ name: "Changed", dataset: "tickets", prompts: [{ prompt: "classifier", version: 2 }] }, failing);

    expect(res.status).toBe(409);
  });

  it("lists evaluations with pagination", async () => {
    await start({ name: "A", dataset: "tickets", prompts: [{ prompt: "classifier", version: 1 }] });
    await start({ name: "B", dataset: "tickets", prompts: [{ prompt: "classifier", version: 1 }] });

    const res = await manage("/projects/support/evaluations?pageSize=1", f.keys.read);
    const body = await res.json<{ evaluations: unknown[]; total: number; totalPages: number }>();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ total: 2, totalPages: 2 });
    expect(body.evaluations).toHaveLength(1);
  });
});
