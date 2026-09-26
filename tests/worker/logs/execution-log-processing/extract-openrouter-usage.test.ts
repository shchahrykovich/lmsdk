import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ExecutionLogProcessingService } from "../../../../worker/logs/execution-log-processing.service";
import { promptExecutionLogs } from "../../../../worker/db/schema";
import { applyMigrations } from "../../helpers/db-setup";
import { openRouterCompletion, openRouterErrorBody } from "../../helpers/openrouter-fixtures";

const openRouterInput = {
  model: "anthropic/claude-sonnet-5",
  messages: [{ role: "user", content: "Hi" }],
};

describe("ExecutionLogProcessingService - OpenRouter usage", () => {
  let db: ReturnType<typeof drizzle>;
  let service: ExecutionLogProcessingService;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    service = new ExecutionLogProcessingService(db, env.PRIVATE_FILES, env.DB);
  });

  const processWith = async (logId: number, output: unknown) => {
    const logPath = `logs/1/2026-09-26/1/1/1/${logId}`;
    await db.insert(promptExecutionLogs).values({
      id: logId,
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
      isSuccess: true,
      durationMs: 10,
      logPath,
    });
    await env.PRIVATE_FILES.put(`${logPath}/input.json`, JSON.stringify(openRouterInput));
    await env.PRIVATE_FILES.put(`${logPath}/output.json`, JSON.stringify(output));

    await service.processExecutionLog(1, 1, logId);

    return env.DB.prepare("SELECT provider, model, usage FROM PromptExecutionLogs WHERE id = ?")
      .bind(logId)
      .first<{ provider: string | null; model: string | null; usage: string | null }>();
  };

  it("stores the five usage keys and the model from the response", async () => {
    const row = await processWith(1, openRouterCompletion("anthropic/claude-sonnet-5-20260801"));

    expect(row?.provider).toBe("openrouter");
    expect(row?.model).toBe("anthropic/claude-sonnet-5-20260801");
    expect(JSON.parse(row!.usage!)).toEqual({
      prompt_tokens: 120,
      cached_tokens: 40,
      completion_tokens: 80,
      reasoning_tokens: 30,
      total_tokens: 200,
    });
  });

  it("stores zero for token details that the response leaves out", async () => {
    const output = openRouterCompletion();
    const { prompt_tokens, completion_tokens, total_tokens } = output.usage;

    const row = await processWith(2, { ...output, usage: { prompt_tokens, completion_tokens, total_tokens } });

    expect(JSON.parse(row!.usage!)).toEqual({
      prompt_tokens: 120,
      cached_tokens: 0,
      completion_tokens: 80,
      reasoning_tokens: 0,
      total_tokens: 200,
    });
  });

  it("leaves the row empty when the output has no usage", async () => {
    const { usage: _usage, ...withoutUsage } = openRouterCompletion();

    const row = await processWith(3, withoutUsage);

    expect(row).toEqual({ provider: null, model: null, usage: null });
  });

  it("leaves the row empty for an error body without choices", async () => {
    const row = await processWith(4, openRouterErrorBody);

    expect(row).toEqual({ provider: null, model: null, usage: null });
  });
});
