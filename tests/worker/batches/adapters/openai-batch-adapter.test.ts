import { describe, it, expect, afterEach, vi } from "vitest";
import { OpenAIBatchAdapter } from "../../../../worker/batches/adapters/openai-batch-adapter";
import { ProviderRejectedError, RetryLaterError } from "../../../../worker/batches/adapters/batch-adapter";
import { jsonResponse, routeFetch, when } from "./fetch-router";

const recordedBatch = (overrides: Record<string, unknown>) => ({
  id: "batch_abc",
  object: "batch",
  endpoint: "/v1/responses",
  input_file_id: "file-in",
  completion_window: "24h",
  status: "in_progress",
  created_at: 1_790_000_000,
  request_counts: { total: 3, completed: 0, failed: 0 },
  metadata: { lmsdk_shard: "shard-key" },
  ...overrides,
});

const recordedResponseBody = (text: string) => ({
  id: "resp_1",
  object: "response",
  model: "gpt-6-luna-2026-09-01",
  status: "completed",
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
  usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 200, total_tokens: 1200 },
});

const shardInput = (text: string) => ({
  shardKey: "shard-key",
  model: "gpt-6-luna",
  itemCount: 1,
  bytes: new TextEncoder().encode(text).byteLength,
  openBody: () => new Blob([text]).stream(),
});

describe("OpenAIBatchAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps the execute request in the batch envelope for /v1/responses", () => {
    const line = JSON.parse(
      new OpenAIBatchAdapter("sk-test").encodeLine("k-0", {
        model: "gpt-6-luna",
        messages: [{ role: "user", content: "Read {{article}}" }],
        variables: { article: "PMID 1" },
      })
    );

    expect(line).toMatchObject({ custom_id: "k-0", method: "POST", url: "/v1/responses" });
    expect(line.body.input[0].content[0].text).toBe("Read PMID 1");
  });

  it("uploads the input through the Uploads API and creates the batch with the shard key", async () => {
    const { calls } = routeFetch([
      when("POST", /\/v1\/uploads$/, () => jsonResponse({ id: "upload_1", object: "upload", status: "pending" })),
      when("POST", /\/v1\/uploads\/upload_1\/parts$/, () => jsonResponse({ id: "part_1", object: "upload.part" })),
      when("POST", /\/v1\/uploads\/upload_1\/complete$/, () =>
        jsonResponse({ id: "upload_1", object: "upload", status: "completed", file: { id: "file-in", object: "file" } })
      ),
      when("POST", /\/v1\/batches$/, () => jsonResponse(recordedBatch({ status: "validating" }))),
    ]);

    const submitted = await new OpenAIBatchAdapter("sk-test").submit(shardInput('{"custom_id":"k-0"}\n'));
    const create = JSON.parse(calls.find((call) => call.url.endsWith("/v1/batches"))!.body);
    const upload = JSON.parse(calls[0]!.body);

    expect(submitted).toEqual({ providerBatchId: "batch_abc", inputFileId: "file-in" });
    expect(upload).toMatchObject({ purpose: "batch", bytes: 20, mime_type: "application/jsonl" });
    expect(create).toEqual({
      input_file_id: "file-in",
      endpoint: "/v1/responses",
      completion_window: "24h",
      metadata: { lmsdk_shard: "shard-key" },
    });
  });

  it("reuses an uploaded input file when the shard is submitted again", async () => {
    const { calls } = routeFetch([when("POST", /\/v1\/batches$/, () => jsonResponse(recordedBatch({})))]);

    await new OpenAIBatchAdapter("sk-test").submit({ ...shardInput("x\n"), existingInputFileId: "file-old" });

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual(["/v1/batches"]);
    expect(JSON.parse(calls[0]!.body).input_file_id).toBe("file-old");
  });

  it.each([
    [429, RetryLaterError],
    [400, ProviderRejectedError],
  ])("classifies HTTP %i on batch create", async (status, errorClass) => {
    routeFetch([when("POST", /\/v1\/batches$/, () => jsonResponse({ error: { message: "no" } }, status))]);

    await expect(
      new OpenAIBatchAdapter("sk-test").submit({ ...shardInput("x\n"), existingInputFileId: "file-old" })
    ).rejects.toBeInstanceOf(errorClass);
  });

  it.each([
    ["validating", false, undefined],
    ["in_progress", false, undefined],
    ["finalizing", false, undefined],
    ["cancelling", false, undefined],
    ["completed", true, "completed"],
    ["expired", true, "expired"],
    ["cancelled", true, "cancelled"],
    ["failed", true, "failed"],
  ])("maps status %s", async (status, done, outcome) => {
    routeFetch([when("GET", /\/v1\/batches\/batch_abc$/, () => jsonResponse(recordedBatch({ status })))]);

    const result = await new OpenAIBatchAdapter("sk-test").poll("batch_abc");

    expect(result.done).toBe(done);
    expect(result.outcome).toBe(outcome);
  });

  it("lists the output and error files of an ended batch", async () => {
    routeFetch([
      when("GET", /\/v1\/batches\/batch_abc$/, () =>
        jsonResponse(recordedBatch({ status: "completed", output_file_id: "file-out", error_file_id: "file-err" }))
      ),
    ]);

    const result = await new OpenAIBatchAdapter("sk-test").poll("batch_abc");

    expect(result.resultFiles).toEqual([
      { kind: "output", ref: "file-out" },
      { kind: "error", ref: "file-err" },
    ]);
  });

  it("asks to resubmit a batch that failed because the enqueued token limit was reached", async () => {
    routeFetch([
      when("GET", /\/v1\/batches\/batch_abc$/, () =>
        jsonResponse(
          recordedBatch({
            status: "failed",
            errors: { object: "list", data: [{ code: "token_limit_exceeded", message: "Enqueued token limit reached for gpt-6-luna" }] },
          })
        )
      ),
    ]);

    const result = await new OpenAIBatchAdapter("sk-test").poll("batch_abc");

    expect(result).toMatchObject({ done: false, resubmit: true });
  });

  it("reads succeeded, errored, expired and cancelled result lines", () => {
    const adapter = new OpenAIBatchAdapter("sk-test");
    const lines = [
      { id: "r1", custom_id: "k-0", response: { status_code: 200, request_id: "q1", body: recordedResponseBody('{"a":1}') }, error: null },
      {
        id: "r2",
        custom_id: "k-1",
        response: { status_code: 400, request_id: "q2", body: { error: { code: "invalid_prompt", message: "too long" } } },
        error: null,
      },
      { id: "r3", custom_id: "k-2", response: null, error: { code: "batch_expired", message: "expired" } },
      { id: "r4", custom_id: "k-3", response: null, error: { code: "batch_cancelled", message: "cancelled" } },
    ].map((line) => adapter.parseResultLine(JSON.stringify(line), "gpt-6-luna"));

    expect(lines[0]).toEqual({
      key: "k-0",
      outcome: {
        kind: "succeeded",
        result: {
          content: '{"a":1}',
          model: "gpt-6-luna-2026-09-01",
          usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200, cached_tokens: 0, cost: (1000 * 0.05 + 200 * 0.25) / 1e6 },
        },
      },
    });
    expect(lines[1]!.outcome).toEqual({ kind: "errored", error: { code: "invalid_prompt", message: "too long" } });
    expect(lines[2]!.outcome).toEqual({ kind: "expired" });
    expect(lines[3]!.outcome).toEqual({ kind: "cancelled" });
  });

  it("downloads a result file and cancels a batch", async () => {
    const { calls } = routeFetch([
      when("GET", /\/v1\/files\/file-out\/content$/, () => new Response("line\n", { headers: { "content-length": "5" } })),
      when("POST", /\/v1\/batches\/batch_abc\/cancel$/, () => jsonResponse(recordedBatch({ status: "cancelling" }))),
    ]);
    const adapter = new OpenAIBatchAdapter("sk-test");

    const file = await adapter.download({ kind: "output", ref: "file-out" });
    await adapter.cancel("batch_abc");

    expect(file.length).toBe(5);
    expect(await new Response(file.body).text()).toBe("line\n");
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toContain("POST /v1/batches/batch_abc/cancel");
  });
});
