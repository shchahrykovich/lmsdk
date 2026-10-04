import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ExecutionLogProcessingService } from "../../../../worker/logs/execution-log-processing.service";
import { OpenAIProvider } from "../../../../worker/providers/openai-provider";
import type { ExecuteResult } from "../../../../worker/providers/base-provider";
import { promptExecutionLogs } from "../../../../worker/db/schema";
import { applyMigrations } from "../../helpers/db-setup";
import { CapturingLogger } from "../../helpers/capturing-logger";

const mockResponsesCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockResponsesCreate };
  },
}));

describe("ExecutionLogProcessingService - cost", () => {
  let db: ReturnType<typeof drizzle>;
  let service: ExecutionLogProcessingService;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    service = new ExecutionLogProcessingService(db, env.PRIVATE_FILES, env.DB);
    mockResponsesCreate.mockResolvedValue({
      model: "gpt-5.2",
      output: [{ type: "message", content: [{ type: "output_text", text: "Hello" }] }],
      usage: { input_tokens: 1_000_000, output_tokens: 100_000, total_tokens: 1_100_000 },
    });
  });

  const runAndProcess = async (logId: number, options: { withResult: boolean }) => {
    const logger = new CapturingLogger();
    await new OpenAIProvider("key", logger).execute({
      model: "gpt-5.2",
      messages: [{ role: "user", content: "Hi" }],
    });

    const logPath = `logs/1/2026-10-04/1/1/1/${logId}`;
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
    await env.PRIVATE_FILES.put(`${logPath}/input.json`, JSON.stringify(logger.inputs[0]));
    await env.PRIVATE_FILES.put(`${logPath}/output.json`, JSON.stringify(logger.outputs[0]));
    if (options.withResult) {
      await env.PRIVATE_FILES.put(`${logPath}/result.json`, JSON.stringify(logger.results[0]));
    }

    await service.processExecutionLog(1, 1, logId);

    const row = await env.DB.prepare("SELECT usage FROM PromptExecutionLogs WHERE id = ?")
      .bind(logId)
      .first<{ usage: string | null }>();
    return { usage: JSON.parse(row!.usage!), result: logger.results[0] as ExecuteResult };
  };

  it("stores the cost from result.json next to the tokens", async () => {
    const { usage, result } = await runAndProcess(1, { withResult: true });

    expect(result.usage.cost).toBeCloseTo(3.15);
    expect(usage.cost).toBe(result.usage.cost);
    expect(usage.total_tokens).toBe(1_100_000);
  });

  it("stores no cost when result.json is missing", async () => {
    const { usage } = await runAndProcess(2, { withResult: false });

    expect(usage).not.toHaveProperty("cost");
    expect(usage.total_tokens).toBe(1_100_000);
  });
});
