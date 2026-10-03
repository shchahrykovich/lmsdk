import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import app from "../../../../worker/index";
import { setupFixtures, type Fixtures } from "./manage/helpers";
import { fetchOpenApi } from "./manage/openapi";

const executionCtx = { waitUntil: (promise: Promise<unknown>) => promise, passThroughOnException: () => {}, props: {} };

const workflowMock = () => ({ create: vi.fn(async ({ id }: { id: string }) => ({ id })), get: vi.fn() });

type BatchBody = { batch: { id: number; state: string; mode: string; discount: string; version: number; cancel_requested: boolean; counts: Record<string, number> } };

const call = (
  path: string,
  key: string | undefined,
  options: { method?: string; body?: unknown; workflow?: ReturnType<typeof workflowMock> } = {}
) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (key !== undefined) headers.set("x-api-key", key);
  return app.request(
    `/api/v1/projects/support/prompts/classifier/batches${path}`,
    { method: options.method ?? "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) },
    { ...env, OPEN_AI_API_KEY: "sk-test", BATCH_WORKFLOW: options.workflow ?? workflowMock() },
    executionCtx as unknown as ExecutionContext
  );
};

const items = (ids: string[]) => ({ items: ids.map((id) => ({ custom_id: id, variables: { word: id } })) });

describe("V1 batches API", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
  });

  it("creates, fills, submits, reads and cancels a batch", async () => {
    const workflow = workflowMock();
    const created = await call("", f.keys.write, { method: "POST", body: { idempotency_key: "run-1", metadata: { owner: "ops" } } });
    const repeat = await call("", f.keys.write, { method: "POST", body: { idempotency_key: "run-1" } });
    const { batch } = await created.json<BatchBody>();

    const added = await call(`/${batch.id}/items`, f.keys.write, { method: "POST", body: items(["a", "b"]) });
    const retried = await call(`/${batch.id}/items`, f.keys.write, { method: "POST", body: items(["b", "c"]) });
    const submitted = await call(`/${batch.id}/submit`, f.keys.write, { method: "POST", body: {}, workflow });
    const resubmitted = await call(`/${batch.id}/submit`, f.keys.write, { method: "POST", body: {}, workflow });
    const results = await call(`/${batch.id}/results?limit=2`, f.keys.write);
    const resultsBody = await results.json<{ items: { custom_id: string; status: string; version: number }[]; next_cursor: string | null }>();
    const nextPage = await call(`/${batch.id}/results?limit=2&cursor=${resultsBody.next_cursor}`, f.keys.write);
    const cancelled = await call(`/${batch.id}/cancel`, f.keys.write, { method: "POST", body: {} });

    expect(created.status).toBe(201);
    expect(batch).toMatchObject({ state: "draft", mode: "native", discount: "batch", version: 1 });
    expect(repeat.status).toBe(200);
    expect((await repeat.json<BatchBody>()).batch.id).toBe(batch.id);
    expect(await added.json()).toMatchObject({ accepted: 2, duplicates: [] });
    expect(await retried.json()).toMatchObject({ accepted: 1, duplicates: ["b"] });
    expect((await submitted.json<BatchBody>()).batch.state).toBe("submitting");
    expect(resubmitted.status).toBe(200);
    expect(workflow.create).toHaveBeenCalledTimes(1);
    expect(resultsBody.items).toEqual([
      expect.objectContaining({ custom_id: "a", status: "pending", version: 1 }),
      expect.objectContaining({ custom_id: "b", status: "pending", version: 1 }),
    ]);
    expect((await nextPage.json<{ items: { custom_id: string }[]; next_cursor: string | null }>()).items.map((item) => item.custom_id)).toEqual(["c"]);
    expect((await cancelled.json<BatchBody>()).batch.cancel_requested).toBe(true);
  });

  it("refuses items after submit with 409", async () => {
    const { batch } = await (await call("", f.keys.write, { method: "POST", body: {} })).json<BatchBody>();
    await call(`/${batch.id}/items`, f.keys.write, { method: "POST", body: items(["a"]) });
    await call(`/${batch.id}/submit`, f.keys.write, { method: "POST", body: {} });

    const late = await call(`/${batch.id}/items`, f.keys.write, { method: "POST", body: items(["z"]) });

    expect(late.status).toBe(409);
  });

  it("returns 400 for more than 1000 items in one call", async () => {
    const { batch } = await (await call("", f.keys.write, { method: "POST", body: {} })).json<BatchBody>();

    const res = await call(`/${batch.id}/items`, f.keys.write, {
      method: "POST",
      body: items(Array.from({ length: 1001 }, (_, index) => `id-${index}`)),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 for a batch of another tenant", async () => {
    const { batch } = await (await call("", f.keys.write, { method: "POST", body: {} })).json<BatchBody>();

    const res = await call(`/${batch.id}`, f.keys.otherTenant);

    expect(res.status).toBe(404);
  });

  it("returns 404 when the batch belongs to another prompt of the same project", async () => {
    const { batch } = await (await call("", f.keys.write, { method: "POST", body: {} })).json<BatchBody>();
    await env.DB.prepare("UPDATE Batches SET promptId = promptId + 1000").run();

    const res = await call(`/${batch.id}`, f.keys.write);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a key", async () => {
    expect((await call("", undefined, { method: "POST", body: {} })).status).toBe(401);
  });

  it("refuses an OpenRouter prompt with 422 unless fallback is paced", async () => {
    await env.DB.prepare("UPDATE PromptVersions SET provider = 'openrouter', model = 'anthropic/claude-sonnet-5'").run();

    const refused = await call("", f.keys.write, { method: "POST", body: {} });
    const paced = await call("", f.keys.write, { method: "POST", body: { fallback: "paced" } });

    expect(refused.status).toBe(422);
    expect((await refused.json<{ error: string }>()).error).toContain('Provider "openrouter"');
    expect(paced.status).toBe(201);
    expect((await paced.json<BatchBody>()).batch).toMatchObject({ mode: "paced", discount: "none" });
  });

  it("lists batches newest first", async () => {
    const first = (await (await call("", f.keys.write, { method: "POST", body: {} })).json<BatchBody>()).batch.id;
    const second = (await (await call("", f.keys.write, { method: "POST", body: {} })).json<BatchBody>()).batch.id;

    const res = await call("?limit=10", f.keys.write);

    expect((await res.json<{ batches: { id: number }[] }>()).batches.map((batch) => batch.id)).toEqual([second, first]);
  });
});

describe("V1 batches API - OpenAPI document", () => {
  it("documents every batch endpoint and says whether it is safe to retry", async () => {
    const doc = await fetchOpenApi();
    const base = "/api/v1/projects/{projectSlugOrId}/prompts/{promptSlugOrId}/batches";
    const operations = [
      [base, "post"],
      [base, "get"],
      [`${base}/{batchId}`, "get"],
      [`${base}/{batchId}/items`, "post"],
      [`${base}/{batchId}/submit`, "post"],
      [`${base}/{batchId}/results`, "get"],
      [`${base}/{batchId}/cancel`, "post"],
    ] as const;

    for (const [path, method] of operations) {
      const spec = doc.paths[path]?.[method];
      expect(spec, `${method} ${path}`).toBeDefined();
      expect(spec!.description, `${method} ${path}`).toMatch(/safe to retry/i);
    }
  });
});
