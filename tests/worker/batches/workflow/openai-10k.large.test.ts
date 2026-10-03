import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { EntityId } from "../../../../worker/shared/entity-id";
import { BatchRetentionService } from "../../../../worker/batches/batch-retention.service";
import { BatchFilesRepository } from "../../../../worker/batches/batch-files.repository";
import { runBatchWorkflow } from "../../../../worker/workflows/batch.workflow";
import { OpenAIBatchAdapter } from "../../../../worker/batches/adapters/openai-batch-adapter";
import { createBatchService, itemsFor, recordingStep, resetDatabase, runnerDeps, setupBatchPrompt, workflowParams } from "../batch-fixtures";
import { jsonResponse, routeFetch, when } from "../adapters/fetch-router";

const ITEMS = 10_000;
const PER_CALL = 1_000;

const multipartFile = async (body: string): Promise<string> => {
  const start = body.indexOf("\r\n\r\n");
  const end = body.lastIndexOf("\r\n--");
  return body.slice(start + 4, end);
};

describe("OpenAI batch of 10,000 items", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is created, filled, submitted and read back with version, usage and batch-price cost on every item", async () => {
    const prompt = await setupBatchPrompt({ model: "gpt-6-luna" });
    let uploaded = "";
    routeFetch([
      when("POST", /\/v1\/uploads$/, () => jsonResponse({ id: "upload_1", object: "upload" })),
      when("POST", /\/v1\/uploads\/upload_1\/parts$/, async (call) => {
        uploaded += await multipartFile(call.body);
        return jsonResponse({ id: "part_1", object: "upload.part" });
      }),
      when("POST", /\/v1\/uploads\/upload_1\/complete$/, () => jsonResponse({ id: "upload_1", file: { id: "file-in" } })),
      when("POST", /\/v1\/batches$/, () => jsonResponse({ id: "batch_1", status: "validating", input_file_id: "file-in" })),
      when("GET", /\/v1\/batches\/batch_1$/, () =>
        jsonResponse({ id: "batch_1", status: "completed", input_file_id: "file-in", output_file_id: "file-out" })
      ),
      when("GET", /\/v1\/files\/file-out\/content$/, () => {
        const output = uploaded
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const request = JSON.parse(line) as { custom_id: string; body: { input: { content: { text: string }[] }[] } };
            const text = request.body.input[1]!.content[0]!.text;
            return JSON.stringify({
              custom_id: request.custom_id,
              response: {
                status_code: 200,
                body: {
                  model: "gpt-6-luna-2026-09-01",
                  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ article: text }) }] }],
                  usage: { input_tokens: 3_000, output_tokens: 500, total_tokens: 3_500 },
                },
              },
              error: null,
            });
          })
          .join("\n");
        return new Response(output + "\n", { headers: { "content-length": String(new TextEncoder().encode(output + "\n").byteLength) } });
      }),
    ]);
    const adapter = new OpenAIBatchAdapter("sk-test");
    const { service } = createBatchService(adapter);

    const { batch } = await service.createBatch(prompt.promptId, { idempotencyKey: "pubmed-run" });
    const batchId = new EntityId(batch.id, prompt.projectId);
    for (let offset = 0; offset < ITEMS; offset += PER_CALL) {
      const page = itemsFor(ITEMS).slice(offset, offset + PER_CALL);
      expect((await service.addItems(batchId, page)).accepted).toBe(PER_CALL);
    }
    await service.submit(batchId);
    await runBatchWorkflow(workflowParams(batchId), recordingStep().step, runnerDeps(adapter));

    const finished = await service.getBatch(batchId);
    const seen: string[] = [];
    let cursor = 0;
    for (;;) {
      const page = await service.listResults(batchId, cursor, 1000);
      for (const { item, stored } of page.items) {
        expect(item.status).toBe("succeeded");
        expect(item.costUsd).toBeCloseTo((3_000 * 0.05 + 500 * 0.25) / 1e6, 12);
        expect(stored?.result).toEqual({ article: `article text ${seen.length}` });
        seen.push(item.customId);
      }
      if (page.items.length < 1000) break;
      cursor = page.items[page.items.length - 1]!.item.id;
    }

    expect(finished.batch).toMatchObject({ state: "finished", version: 1, totalItems: ITEMS, succeededCount: ITEMS });
    expect(finished.batch.costUsd).toBeCloseTo(ITEMS * ((3_000 * 0.05 + 500 * 0.25) / 1e6), 6);
    expect(finished.shards).toHaveLength(1);
    expect(seen).toHaveLength(ITEMS);
    await new BatchRetentionService(drizzle(env.DB), new BatchFilesRepository(env.PRIVATE_FILES)).purgeExpired(
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    );
  }, 300_000);
});
