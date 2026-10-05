import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ExecutionLogProcessingService } from "../../../../worker/logs/execution-log-processing.service";
import { OpenRouterDecisionsProvider } from "../../../../worker/providers/openrouter-decisions-provider";
import { promptExecutionLogs } from "../../../../worker/db/schema";
import { applyMigrations } from "../../helpers/db-setup";
import { CapturingLogger } from "../../helpers/capturing-logger";

const decisionResponse = {
  id: "gen-dec-1",
  model: "typesafe/jev-1.13-20260917",
  provider: "TypeSafe",
  answers: { is_bug: { type: "noul", noul: 0.96 } },
  usage: { input_tokens: 476, output_tokens: 70, cost: 0.00002 },
};

describe("ExecutionLogProcessingService - OpenRouter Decisions usage", () => {
  let db: ReturnType<typeof drizzle>;
  let service: ExecutionLogProcessingService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    service = new ExecutionLogProcessingService(db, env.PRIVATE_FILES, env.DB);
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify(decisionResponse), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("labels a logged decisions run and stores its token counts", async () => {
    const logger = new CapturingLogger();
    await new OpenRouterDecisionsProvider("key", logger).execute({
      model: "typesafe/jev-1.13",
      messages: [{ role: "user", content: "Blank checkout page" }],
      decision_questions: {
        is_bug: { type: "noul", instructions: "Is it a bug?", criteria: { true: "Yes", false: "No" } },
      },
    });

    const logPath = "logs/1/2026-10-05/1/1/1/1";
    await db.insert(promptExecutionLogs).values({
      id: 1,
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
      isSuccess: true,
      durationMs: 10,
      logPath,
    });
    await env.PRIVATE_FILES.put(`${logPath}/input.json`, JSON.stringify(logger.inputs[0]));
    await env.PRIVATE_FILES.put(`${logPath}/output.json`, JSON.stringify(logger.outputs[0]));

    await service.processExecutionLog(1, 1, 1);

    const row = await env.DB.prepare("SELECT provider, model, usage FROM PromptExecutionLogs WHERE id = ?")
      .bind(1)
      .first<{ provider: string | null; model: string | null; usage: string | null }>();
    expect(row?.provider).toBe("openrouter-decisions");
    expect(row?.model).toBe("typesafe/jev-1.13-20260917");
    expect(JSON.parse(row!.usage!)).toEqual({ input_tokens: 476, output_tokens: 70, total_tokens: 546 });
  });
});
