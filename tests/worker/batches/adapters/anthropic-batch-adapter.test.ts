import { describe, it, expect, afterEach, vi } from "vitest";
import { AnthropicBatchAdapter } from "../../../../worker/batches/adapters/anthropic-batch-adapter";
import { RetryLaterError } from "../../../../worker/batches/adapters/batch-adapter";
import { jsonResponse, routeFetch, when } from "./fetch-router";

const recordedBatch = (overrides: Record<string, unknown>) => ({
  id: "msgbatch_01",
  type: "message_batch",
  processing_status: "in_progress",
  request_counts: { processing: 2, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
  created_at: "2026-10-03T10:00:00Z",
  expires_at: "2026-10-04T10:00:00Z",
  ended_at: null,
  cancel_initiated_at: null,
  archived_at: null,
  results_url: null,
  ...overrides,
});

const recordedMessage = (text: string, stopReason = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content: [{ type: "text", text }],
  stop_reason: stopReason,
  stop_sequence: null,
  usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});

describe("AnthropicBatchAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps the execute request as custom_id and params", () => {
    const line = JSON.parse(
      new AnthropicBatchAdapter("sk-ant").encodeLine("abc-0", {
        model: "claude-sonnet-5-5",
        messages: [
          { role: "system", content: "Be brief." },
          { role: "user", content: "Read {{article}}" },
        ],
        variables: { article: "PMID 1" },
      })
    );

    expect(line).toEqual({
      custom_id: "abc-0",
      params: {
        model: "claude-sonnet-5-5",
        max_tokens: 16000,
        system: "Be brief.",
        messages: [{ role: "user", content: "Read PMID 1" }],
      },
    });
  });

  it("submits every line of the shard as one Message Batch", async () => {
    const { calls } = routeFetch([when("POST", /\/v1\/messages\/batches$/, () => jsonResponse(recordedBatch({})))]);
    const body = '{"custom_id":"a-0","params":{"model":"m","max_tokens":5,"messages":[]}}\n{"custom_id":"a-1","params":{"model":"m","max_tokens":5,"messages":[]}}\n';

    const submitted = await new AnthropicBatchAdapter("sk-ant").submit({
      shardKey: "s",
      model: "m",
      itemCount: 2,
      bytes: body.length,
      openBody: () => new Blob([body]).stream(),
    });

    expect(submitted).toEqual({ providerBatchId: "msgbatch_01" });
    expect(JSON.parse(calls[0]!.body).requests.map((request: { custom_id: string }) => request.custom_id)).toEqual(["a-0", "a-1"]);
  });

  it("turns HTTP 429 on create into retry later", async () => {
    routeFetch([when("POST", /\/v1\/messages\/batches$/, () => jsonResponse({ type: "error", error: { type: "rate_limit_error", message: "slow" } }, 429))]);

    await expect(
      new AnthropicBatchAdapter("sk-ant").submit({ shardKey: "s", model: "m", itemCount: 0, bytes: 0, openBody: () => new Blob([""]).stream() })
    ).rejects.toBeInstanceOf(RetryLaterError);
  });

  it.each([
    [{ processing_status: "in_progress" }, false, undefined],
    [{ processing_status: "canceling", cancel_initiated_at: "2026-10-03T10:05:00Z" }, false, undefined],
    [{ processing_status: "ended" }, true, "completed"],
    [{ processing_status: "ended", cancel_initiated_at: "2026-10-03T10:05:00Z" }, true, "cancelled"],
  ])("maps %j", async (overrides, done, outcome) => {
    routeFetch([when("GET", /\/v1\/messages\/batches\/msgbatch_01$/, () => jsonResponse(recordedBatch(overrides)))]);

    const status = await new AnthropicBatchAdapter("sk-ant").poll("msgbatch_01");

    expect(status.done).toBe(done);
    expect(status.outcome).toBe(outcome);
  });

  it("reads succeeded, errored, canceled, expired and refused results", () => {
    const adapter = new AnthropicBatchAdapter("sk-ant");
    const lines = [
      { custom_id: "a-0", result: { type: "succeeded", message: recordedMessage('{"x":1}') } },
      {
        custom_id: "a-1",
        result: { type: "errored", error: { type: "error", error: { type: "invalid_request_error", message: "bad" }, request_id: null } },
      },
      { custom_id: "a-2", result: { type: "canceled" } },
      { custom_id: "a-3", result: { type: "expired" } },
      { custom_id: "a-4", result: { type: "succeeded", message: recordedMessage("", "refusal") } },
    ].map((line) => adapter.parseResultLine(JSON.stringify(line), "claude-sonnet-5-5").outcome);

    expect(lines[0]).toEqual({
      kind: "succeeded",
      result: {
        content: '{"x":1}',
        model: "claude-sonnet-5-5",
        usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, cost: (1000 * 1 + 100 * 5) / 1e6 },
      },
    });
    expect(lines[1]).toEqual({ kind: "errored", error: { code: "invalid_request_error", message: "bad" } });
    expect(lines[2]).toEqual({ kind: "cancelled" });
    expect(lines[3]).toEqual({ kind: "expired" });
    expect(lines[4]).toMatchObject({ kind: "errored", error: { code: "refusal" } });
  });

  it("downloads the results as JSON lines and cancels a batch", async () => {
    const result = { custom_id: "a-0", result: { type: "expired" } };
    routeFetch([
      when("GET", /\/v1\/messages\/batches\/msgbatch_01$/, () =>
        jsonResponse(recordedBatch({ processing_status: "ended", results_url: "https://api.anthropic.com/v1/messages/batches/msgbatch_01/results" }))
      ),
      when("GET", /\/results$/, () => new Response(JSON.stringify(result) + "\n", { headers: { "content-type": "application/x-jsonl" } })),
      when("POST", /\/cancel$/, () => jsonResponse(recordedBatch({ processing_status: "canceling" }))),
    ]);
    const adapter = new AnthropicBatchAdapter("sk-ant");

    const file = await adapter.download({ kind: "results", ref: "msgbatch_01" });
    await adapter.cancel("msgbatch_01");

    expect(await new Response(file.body).text()).toBe(JSON.stringify(result) + "\n");
  });
});
