import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { TraceExtractionService } from "../../../../worker/traces/trace-extraction.service";
import { ExecutionLogProcessingService } from "../../../../worker/logs/execution-log-processing.service";
import { OpenRouterProvider } from "../../../../worker/providers/openrouter-provider";
import { promptExecutionLogs } from "../../../../worker/db/schema";
import type { Trace } from "../../../../worker/db/schema";
import { applyMigrations } from "../../helpers/db-setup";
import { CapturingLogger } from "../../helpers/capturing-logger";
import { openRouterCompletion } from "../../helpers/openrouter-fixtures";

const mockChatCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } };
  },
}));

describe("TraceExtractionService - OpenRouter usage aggregation", () => {
  let db: ReturnType<typeof drizzle>;
  let traceService: TraceExtractionService;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    traceService = new TraceExtractionService(db, env.PRIVATE_FILES);
    mockChatCreate.mockReset();
  });

  const readStats = async (traceId: string) => {
    const trace = await env.DB.prepare("SELECT stats FROM Traces WHERE traceId = ? AND tenantId = ? AND projectId = ?")
      .bind(traceId, 1, 1)
      .first<Trace>();
    return JSON.parse(trace!.stats!);
  };

  it("sums the five OpenRouter usage keys per model", async () => {
    const traceId = "trace-openrouter-sum";
    for (const [id, usage] of [
      [1, { prompt_tokens: 100, cached_tokens: 10, completion_tokens: 50, reasoning_tokens: 5, total_tokens: 150 }],
      [2, { prompt_tokens: 200, cached_tokens: 20, completion_tokens: 60, reasoning_tokens: 6, total_tokens: 260 }],
    ] as const) {
      await db.insert(promptExecutionLogs).values({
        id,
        tenantId: 1,
        projectId: 1,
        promptId: 1,
        version: 1,
        traceId,
        isSuccess: true,
        durationMs: 10,
        provider: "openrouter",
        model: "anthropic/claude-sonnet-5",
        usage: JSON.stringify(usage),
        logPath: `logs/1/2026-09-26/1/1/1/${id}`,
      });
    }

    await traceService.extractTrace(1, 1, traceId);

    const stats = await readStats(traceId);
    expect(stats.providers).toEqual([
      {
        provider: "openrouter",
        models: [
          {
            model: "anthropic/claude-sonnet-5",
            count: 2,
            tokens: {
              prompt_tokens: 300,
              cached_tokens: 30,
              completion_tokens: 110,
              reasoning_tokens: 11,
              total_tokens: 410,
            },
          },
        ],
      },
    ]);
  });

  it("reads back exactly what log processing wrote for a real OpenRouter run", async () => {
    const traceId = "trace-openrouter-round-trip";
    const logger = new CapturingLogger();
    mockChatCreate.mockResolvedValue(openRouterCompletion());
    await new OpenRouterProvider("key", logger).execute({
      model: "anthropic/claude-sonnet-5",
      messages: [{ role: "user", content: "Hi" }],
    });
    const logPath = "logs/1/2026-09-26/1/1/1/7";
    await db.insert(promptExecutionLogs).values({
      id: 7,
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
      traceId,
      isSuccess: true,
      durationMs: 10,
      logPath,
    });
    await env.PRIVATE_FILES.put(`${logPath}/input.json`, JSON.stringify(logger.inputs[0]));
    await env.PRIVATE_FILES.put(`${logPath}/output.json`, JSON.stringify(logger.outputs[0]));
    await new ExecutionLogProcessingService(db, env.PRIVATE_FILES, env.DB).processExecutionLog(1, 1, 7);
    const [processed] = await db.select().from(promptExecutionLogs).where(eq(promptExecutionLogs.id, 7));
    expect(processed.provider).toBe("openrouter");

    await traceService.extractTrace(1, 1, traceId);

    const tokens = (await readStats(traceId)).providers[0].models[0].tokens;
    expect(tokens).toEqual({
      prompt_tokens: 120,
      cached_tokens: 40,
      completion_tokens: 80,
      reasoning_tokens: 30,
      total_tokens: 200,
    });
  });
});
