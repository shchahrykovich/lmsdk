import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ExecutionLogProcessingService } from "../../../../worker/logs/execution-log-processing.service";
import { OpenAIProvider } from "../../../../worker/providers/openai-provider";
import { GoogleProvider } from "../../../../worker/providers/google-provider";
import { OpenRouterProvider } from "../../../../worker/providers/openrouter-provider";
import type { AIProvider, ExecuteRequest } from "../../../../worker/providers/base-provider";
import { promptExecutionLogs } from "../../../../worker/db/schema";
import { applyMigrations } from "../../helpers/db-setup";
import { CapturingLogger } from "../../helpers/capturing-logger";
import { openRouterCompletion } from "../../helpers/openrouter-fixtures";

const mockResponsesCreate = vi.fn();
const mockChatCreate = vi.fn();
const mockGenerateContentStream = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockResponsesCreate };
    chat = { completions: { create: mockChatCreate } };
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContentStream: mockGenerateContentStream };
    caches = { create: vi.fn() };
  },
}));

async function* googleStream() {
  yield {
    text: "Hello from Gemini",
    modelVersion: "gemini-2.5-flash",
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  };
}

describe("ExecutionLogProcessingService - provider detection from real logged payloads", () => {
  let db: ReturnType<typeof drizzle>;
  let service: ExecutionLogProcessingService;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    service = new ExecutionLogProcessingService(db, env.PRIVATE_FILES, env.DB);
    mockResponsesCreate.mockResolvedValue({
      model: "gpt-5.2",
      output: [{ type: "message", content: [{ type: "output_text", text: "Hello from OpenAI" }] }],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });
    mockChatCreate.mockResolvedValue(openRouterCompletion());
    mockGenerateContentStream.mockImplementation(async () => googleStream());
  });

  const runAndProcess = async (
    logId: number,
    provider: AIProvider,
    logger: CapturingLogger,
    model: string,
    extra: Partial<ExecuteRequest> = {}
  ) => {
    await provider.execute({
      model,
      messages: [{ role: "system", content: "Be brief" }, { role: "user", content: "Hi" }],
      ...extra,
    });

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
    await env.PRIVATE_FILES.put(`${logPath}/input.json`, JSON.stringify(logger.inputs[0]));
    await env.PRIVATE_FILES.put(`${logPath}/output.json`, JSON.stringify(logger.outputs[0]));

    await service.processExecutionLog(1, 1, logId);

    return env.DB.prepare("SELECT provider, model FROM PromptExecutionLogs WHERE id = ?")
      .bind(logId)
      .first<{ provider: string | null; model: string | null }>();
  };

  it("labels an OpenAI run as openai", async () => {
    const logger = new CapturingLogger();

    const row = await runAndProcess(1, new OpenAIProvider("key", logger), logger, "gpt-5.2");

    expect(row).toEqual({ provider: "openai", model: "gpt-5.2" });
  });

  it("labels a Google run as google", async () => {
    const logger = new CapturingLogger();

    const row = await runAndProcess(2, new GoogleProvider("key", logger, env.CACHE), logger, "gemini-2.5-flash");

    expect(row).toEqual({ provider: "google", model: "gemini-2.5-flash" });
  });

  it("labels an OpenRouter run as openrouter", async () => {
    const logger = new CapturingLogger();

    const row = await runAndProcess(3, new OpenRouterProvider("key", logger), logger, "anthropic/claude-sonnet-5");

    expect(row).toEqual({ provider: "openrouter", model: "anthropic/claude-sonnet-5" });
  });

  it("labels an OpenRouter JSON run as openrouter", async () => {
    const logger = new CapturingLogger();

    const row = await runAndProcess(4, new OpenRouterProvider("key", logger), logger, "anthropic/claude-sonnet-5", {
      response_format: { type: "json_schema", json_schema: { name: "reply", schema: { type: "object" } } },
    });

    expect(row?.provider).toBe("openrouter");
  });
});
