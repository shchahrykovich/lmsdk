import { describe, it, expect, afterEach, vi } from "vitest";
import { GoogleBatchAdapter } from "../../../../worker/batches/adapters/google-batch-adapter";
import { ProviderRejectedError, RetryLaterError } from "../../../../worker/batches/adapters/batch-adapter";
import { jsonResponse, routeFetch, when } from "./fetch-router";

const operation = (state: string, extra: Record<string, unknown> = {}) => ({
  name: "batches/b123",
  metadata: { "@type": "type.googleapis.com/google.ai.generativelanguage.v1beta.GenerateContentBatch", state, ...extra },
});

describe("GoogleBatchAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the REST request with the system instruction inline and no cache", () => {
    const line = JSON.parse(
      new GoogleBatchAdapter("g-key").encodeLine("k-0", {
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "Extract." },
          { role: "user", content: "{{article}}" },
        ],
        variables: { article: "PMID 1" },
        response_format: { type: "json" },
        google_settings: { cache_system_message: true, thinking_budget: 512 },
        projectId: 1,
        promptSlug: "extract",
      })
    );

    expect(line).toEqual({
      key: "k-0",
      request: {
        contents: [{ role: "user", parts: [{ text: "PMID 1" }] }],
        systemInstruction: { role: "user", parts: [{ text: "Extract." }] },
        generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 512 } },
      },
    });
  });

  it("uploads the input with a resumable upload and creates the batch", async () => {
    const { calls } = routeFetch([
      when("POST", /\/upload\/v1beta\/files$/, () =>
        new Response("{}", { headers: { "x-goog-upload-url": "https://upload.example/session-1" } })
      ),
      when("POST", /upload\.example\/session-1$/, () => jsonResponse({ file: { name: "files/input-1" } })),
      when("POST", /:batchGenerateContent$/, () => jsonResponse(operation("BATCH_STATE_PENDING"))),
    ]);
    const body = '{"key":"k-0","request":{}}\n';

    const submitted = await new GoogleBatchAdapter("g-key").submit({
      shardKey: "shard-1",
      model: "gemini-2.5-flash",
      itemCount: 1,
      bytes: body.length,
      openBody: () => new Blob([body]).stream(),
    });

    expect(submitted).toEqual({ providerBatchId: "batches/b123", inputFileId: "files/input-1" });
    expect(calls[0]!.headers.get("X-Goog-Upload-Header-Content-Length")).toBe(String(body.length));
    expect(calls[1]!.body).toBe(body);
    expect(JSON.parse(calls[2]!.body)).toEqual({ batch: { displayName: "shard-1", inputConfig: { fileName: "files/input-1" } } });
  });

  it.each([
    [429, RetryLaterError],
    [400, ProviderRejectedError],
  ])("classifies HTTP %i on batch create", async (status, errorClass) => {
    routeFetch([when("POST", /:batchGenerateContent$/, () => jsonResponse({ error: { message: "no" } }, status))]);

    await expect(
      new GoogleBatchAdapter("g-key").submit({
        shardKey: "s",
        model: "gemini-2.5-flash",
        itemCount: 1,
        bytes: 1,
        existingInputFileId: "files/old",
        openBody: () => new Blob([""]).stream(),
      })
    ).rejects.toBeInstanceOf(errorClass);
  });

  it.each([
    ["BATCH_STATE_PENDING", false, undefined],
    ["BATCH_STATE_RUNNING", false, undefined],
    ["BATCH_STATE_SUCCEEDED", true, "completed"],
    ["BATCH_STATE_FAILED", true, "failed"],
    ["BATCH_STATE_CANCELLED", true, "cancelled"],
    ["BATCH_STATE_EXPIRED", true, "expired"],
    ["JOB_STATE_SUCCEEDED", true, "completed"],
  ])("maps %s", async (state, done, outcome) => {
    routeFetch([when("GET", /\/v1beta\/batches\/b123$/, () => jsonResponse(operation(state)))]);

    const status = await new GoogleBatchAdapter("g-key").poll("batches/b123");

    expect(status.done).toBe(done);
    expect(status.outcome).toBe(outcome);
  });

  it("finds the responses file of a finished batch", async () => {
    routeFetch([
      when("GET", /\/v1beta\/batches\/b123$/, () =>
        jsonResponse({ ...operation("BATCH_STATE_SUCCEEDED"), done: true, response: { responsesFile: "files/out-1" } })
      ),
    ]);

    const status = await new GoogleBatchAdapter("g-key").poll("batches/b123");

    expect(status.resultFiles).toEqual([{ kind: "responses", ref: "files/out-1" }]);
  });

  it("reads a succeeded line without thought parts, and an error line", () => {
    const adapter = new GoogleBatchAdapter("g-key");
    const succeeded = adapter.parseResultLine(
      JSON.stringify({
        key: "k-0",
        response: {
          candidates: [{ content: { role: "model", parts: [{ text: "thinking", thought: true }, { text: '{"a":1}' }] } }],
          usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50, totalTokenCount: 1150 },
        },
      }),
      "gemini-2.5-flash"
    );
    const errored = adapter.parseResultLine(
      JSON.stringify({ key: "k-1", error: { code: 400, message: "Request contains an invalid argument.", status: "INVALID_ARGUMENT" } }),
      "gemini-2.5-flash"
    );

    expect(succeeded.outcome).toMatchObject({ kind: "succeeded", result: { content: '{"a":1}', model: "gemini-2.5-flash" } });
    expect((succeeded.outcome as { result: { usage: { cost: number } } }).result.usage.cost).toBeCloseTo(
      (1000 * 0.15 + 150 * 1.25) / 1e6,
      12
    );
    expect(errored.outcome).toEqual({ kind: "errored", error: { code: "400", message: "Request contains an invalid argument." } });
  });

  it("downloads the responses file and cancels a batch", async () => {
    const { calls } = routeFetch([
      when("GET", /\/download\/v1beta\/files\/out-1:download\?alt=media$/, () => new Response("x\n", { headers: { "content-length": "2" } })),
      when("POST", /\/v1beta\/batches\/b123:cancel$/, () => jsonResponse({})),
    ]);
    const adapter = new GoogleBatchAdapter("g-key");

    const file = await adapter.download({ kind: "responses", ref: "files/out-1" });
    await adapter.cancel("batches/b123");

    expect(file.length).toBe(2);
    expect(calls[1]!.url).toContain("batches/b123:cancel");
  });
});
