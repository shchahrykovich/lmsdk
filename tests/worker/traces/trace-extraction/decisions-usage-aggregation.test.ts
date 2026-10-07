import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TraceExtractionService } from "../../../../worker/traces/trace-extraction.service";
import { promptExecutionLogs } from "../../../../worker/db/schema";
import type { Trace } from "../../../../worker/db/schema";
import { applyMigrations } from "../../helpers/db-setup";

describe("TraceExtractionService - OpenRouter Decisions usage aggregation", () => {
  let db: ReturnType<typeof drizzle>;
  let traceService: TraceExtractionService;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    traceService = new TraceExtractionService(db, env.PRIVATE_FILES);
  });

  const insertDecisionLog = (id: number, traceId: string, usage: Record<string, number>) =>
    db.insert(promptExecutionLogs).values({
      id,
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
      traceId,
      isSuccess: true,
      durationMs: 10,
      provider: "openrouter-decisions",
      model: "typesafe/jev-1.13",
      usage: JSON.stringify(usage),
      logPath: `logs/1/2026-10-05/1/1/1/${id}`,
    });

  it("sums the input, output and total tokens of decision runs per model", async () => {
    const traceId = "trace-decisions-sum";
    await insertDecisionLog(1, traceId, { input_tokens: 100, output_tokens: 3, total_tokens: 103 });
    await insertDecisionLog(2, traceId, { input_tokens: 200, output_tokens: 4, total_tokens: 204 });

    await traceService.extractTrace(1, 1, traceId);

    const trace = await env.DB.prepare("SELECT stats FROM Traces WHERE traceId = ? AND tenantId = ? AND projectId = ?")
      .bind(traceId, 1, 1)
      .first<Trace>();
    expect(JSON.parse(trace!.stats!).providers).toEqual([
      {
        provider: "openrouter-decisions",
        models: [
          {
            model: "typesafe/jev-1.13",
            count: 2,
            tokens: { input_tokens: 300, output_tokens: 7, total_tokens: 307 },
          },
        ],
      },
    ]);
  });
});
