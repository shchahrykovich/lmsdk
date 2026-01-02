import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ExecutionLogProcessingService } from "../../../../worker/services/execution-log-processing.service";
import { applyMigrations } from "../../helpers/db-setup";
import { promptExecutionLogs } from "../../../../worker/db/schema";

describe("ExecutionLogProcessingService - Extract Usage Stats", () => {
  let service: ExecutionLogProcessingService;
  let db: ReturnType<typeof drizzle>;
  let r2: R2Bucket;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    r2 = env.PRIVATE_FILES;
    service = new ExecutionLogProcessingService(db, r2, env.DB);
  });

  const createLog = async (
    tenantId: number,
    projectId: number,
    logId: number,
    logPath: string
  ) => {
    const [log] = await db
      .insert(promptExecutionLogs)
      .values({
        id: logId,
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        durationMs: 100,
        logPath,
        createdAt: new Date(),
      })
      .returning();
    return log;
  };

  describe("OpenAI Provider Usage Extraction", () => {
    it("extracts usage from OpenAI output.json", async () => {
      const logPath = "logs/1/2026-01-02/1/1/1/1";
      await createLog(1, 1, 1, logPath);

      // Create input.json (OpenAI format)
      const inputData = {
        model: "o1-mini",
        input: [{ role: "user", content: [{ type: "input_text", text: "Hello" }] }],
        text: { format: { type: "text" }, verbosity: "medium" },
        reasoning: { effort: "medium", summary: "auto" },
        tools: [],
        store: true,
      };

      await r2.put(`${logPath}/input.json`, JSON.stringify(inputData));

      // Create output.json with usage
      const outputData = {
        id: "resp_123",
        model: "o1-mini-2024-12-17",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Hello! How can I help?" }],
          },
        ],
        usage: {
          input_tokens: 150,
          input_tokens_details: {
            cached_tokens: 50,
          },
          output_tokens: 80,
          output_tokens_details: {
            reasoning_tokens: 30,
          },
          total_tokens: 230,
        },
      };

      await r2.put(`${logPath}/output.json`, JSON.stringify(outputData));

      // Process the log
      await service.processExecutionLog(1, 1, 1);

      // Verify database was updated
      const dbLog = await env.DB.prepare(
        "SELECT provider, model, usage FROM PromptExecutionLogs WHERE id = ?"
      )
        .bind(1)
        .first<{ provider: string; model: string; usage: string }>();

      expect(dbLog).not.toBeNull();
      expect(dbLog?.provider).toBe("openai");
      expect(dbLog?.model).toBe("o1-mini-2024-12-17");

      const usage = JSON.parse(dbLog!.usage);
      expect(usage.input_tokens).toBe(150);
      expect(usage.cached_tokens).toBe(50);
      expect(usage.output_tokens).toBe(80);
      expect(usage.reasoning_tokens).toBe(30);
      expect(usage.total_tokens).toBe(230);
    });

    it("handles OpenAI output without cached tokens", async () => {
      const logPath = "logs/1/2026-01-02/1/1/1/2";
      await createLog(1, 1, 2, logPath);

      const inputData = {
        model: "gpt-4",
        input: [],
        text: { format: { type: "text" } },
        reasoning: { effort: "medium" },
      };

      const outputData = {
        model: "gpt-4-turbo",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
        },
      };

      await r2.put(`${logPath}/input.json`, JSON.stringify(inputData));
      await r2.put(`${logPath}/output.json`, JSON.stringify(outputData));

      await service.processExecutionLog(1, 1, 2);

      const dbLog = await env.DB.prepare(
        "SELECT usage FROM PromptExecutionLogs WHERE id = ?"
      )
        .bind(2)
        .first<{ usage: string }>();

      const usage = JSON.parse(dbLog!.usage);
      expect(usage.input_tokens).toBe(100);
      expect(usage.cached_tokens).toBe(0);
      expect(usage.output_tokens).toBe(50);
      expect(usage.reasoning_tokens).toBe(0);
      expect(usage.total_tokens).toBe(150);
    });
  });

  describe("Google Provider Usage Extraction", () => {
    it("extracts usage from Google streaming output.json", async () => {
      const logPath = "logs/1/2026-01-02/1/1/1/3";
      await createLog(1, 1, 3, logPath);

      // Create input.json (Google format)
      const inputData = {
        model: "gemini-2.0-flash-thinking-exp",
        config: {
          systemInstruction: "You are a helpful assistant",
          thinkingConfig: { includeThoughts: true },
        },
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      };

      await r2.put(`${logPath}/input.json`, JSON.stringify(inputData));

      // Create output.json with streaming chunks
      const outputData = [
        {
          candidates: [
            {
              content: {
                parts: [{ text: "Hello!" }],
                role: "model",
              },
              index: 0,
            },
          ],
          modelVersion: "gemini-2.0-flash-thinking-exp-01-21",
          responseId: "abc123",
          usageMetadata: {
            promptTokenCount: 473,
            candidatesTokenCount: 6,
            totalTokenCount: 479,
          },
        },
        {
          candidates: [
            {
              content: {
                parts: [{ text: " How can I help you today?" }],
                role: "model",
              },
              index: 0,
            },
          ],
          modelVersion: "gemini-2.0-flash-thinking-exp-01-21",
          responseId: "abc123",
          usageMetadata: {
            promptTokenCount: 473,
            candidatesTokenCount: 26,
            totalTokenCount: 499,
            thoughtsTokenCount: 10,
          },
        },
      ];

      await r2.put(`${logPath}/output.json`, JSON.stringify(outputData));

      await service.processExecutionLog(1, 1, 3);

      const dbLog = await env.DB.prepare(
        "SELECT provider, model, usage FROM PromptExecutionLogs WHERE id = ?"
      )
        .bind(3)
        .first<{ provider: string; model: string; usage: string }>();

      expect(dbLog).not.toBeNull();
      expect(dbLog?.provider).toBe("google");
      expect(dbLog?.model).toBe("gemini-2.0-flash-thinking-exp-01-21");

      // Should use the last chunk's usage metadata
      const usage = JSON.parse(dbLog!.usage);
      expect(usage.prompt_tokens).toBe(473);
      expect(usage.cached_tokens).toBe(0);
      expect(usage.response_tokens).toBe(26);
      expect(usage.thoughts_tokens).toBe(10);
      expect(usage.total_tokens).toBe(499);
    });

    it("handles Google output with cached content tokens", async () => {
      const logPath = "logs/1/2026-01-02/1/1/1/4";
      await createLog(1, 1, 4, logPath);

      const inputData = {
        model: "gemini-2.0-flash",
        config: {},
        contents: [],
      };

      const outputData = [
        {
          modelVersion: "gemini-2.0-flash-001",
          usageMetadata: {
            promptTokenCount: 1000,
            cachedContentTokenCount: 500,
            candidatesTokenCount: 200,
            toolUsePromptTokenCount: 50,
            totalTokenCount: 1250,
          },
        },
      ];

      await r2.put(`${logPath}/input.json`, JSON.stringify(inputData));
      await r2.put(`${logPath}/output.json`, JSON.stringify(outputData));

      await service.processExecutionLog(1, 1, 4);

      const dbLog = await env.DB.prepare(
        "SELECT usage FROM PromptExecutionLogs WHERE id = ?"
      )
        .bind(4)
        .first<{ usage: string }>();

      const usage = JSON.parse(dbLog!.usage);
      expect(usage.prompt_tokens).toBe(1000);
      expect(usage.cached_tokens).toBe(500);
      expect(usage.response_tokens).toBe(200);
      expect(usage.tool_use_prompt_tokens).toBe(50);
      expect(usage.total_tokens).toBe(1250);
    });

    it("handles Google chunks without usage metadata", async () => {
      const logPath = "logs/1/2026-01-02/1/1/1/5";
      await createLog(1, 1, 5, logPath);

      const inputData = {
        model: "gemini-flash",
        config: {},
        contents: [],
      };

      // Chunks without usage metadata
      const outputData = [
        {
          modelVersion: "gemini-flash-001",
          candidates: [
            {
              content: { parts: [{ text: "Response" }], role: "model" },
            },
          ],
        },
      ];

      await r2.put(`${logPath}/input.json`, JSON.stringify(inputData));
      await r2.put(`${logPath}/output.json`, JSON.stringify(outputData));

      await service.processExecutionLog(1, 1, 5);

      const dbLog = await env.DB.prepare(
        "SELECT provider, model FROM PromptExecutionLogs WHERE id = ?"
      )
        .bind(5)
        .first<{ provider: string | null; model: string | null }>();

      // Should not update if no usage metadata found
      expect(dbLog?.provider).toBeNull();
      expect(dbLog?.model).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    it("handles missing output.json", async () => {
      const logPath = "logs/1/2026-01-02/1/1/1/6";
      await createLog(1, 1, 6, logPath);

      const inputData = {
        model: "test-model",
        input: [],
        text: {},
        reasoning: {},
      };

      await r2.put(`${logPath}/input.json`, JSON.stringify(inputData));
      // No output.json

      // Should not throw
      await expect(service.processExecutionLog(1, 1, 6)).resolves.not.toThrow();

      const dbLog = await env.DB.prepare(
        "SELECT provider, model FROM PromptExecutionLogs WHERE id = ?"
      )
        .bind(6)
        .first<{ provider: string | null; model: string | null }>();

      expect(dbLog?.provider).toBeNull();
    });

    it("handles missing input.json", async () => {
      const logPath = "logs/1/2026-01-02/1/1/1/7";
      await createLog(1, 1, 7, logPath);

      const outputData = { model: "test-model", usage: {} };
      await r2.put(`${logPath}/output.json`, JSON.stringify(outputData));
      // No input.json

      await expect(service.processExecutionLog(1, 1, 7)).resolves.not.toThrow();
    });

    it("handles invalid JSON in output.json", async () => {
      const logPath = "logs/1/2026-01-02/1/1/1/8";
      await createLog(1, 1, 8, logPath);

      const inputData = { model: "test", input: [], text: {}, reasoning: {} };
      await r2.put(`${logPath}/input.json`, JSON.stringify(inputData));
      await r2.put(`${logPath}/output.json`, "{invalid json}");

      await expect(service.processExecutionLog(1, 1, 8)).resolves.not.toThrow();
    });

    it("handles log without logPath", async () => {
      const [log] = await db
        .insert(promptExecutionLogs)
        .values({
          id: 9,
          tenantId: 1,
          projectId: 1,
          promptId: 1,
          version: 1,
          isSuccess: true,
          logPath: null,
          createdAt: new Date(),
        })
        .returning();

      await expect(service.processExecutionLog(1, 1, 9)).resolves.not.toThrow();
    });
  });

  describe("Cross-tenant Protection", () => {
    it("only processes logs for specified tenant", async () => {
      const logPath1 = "logs/1/2026-01-02/1/1/1/10";
      const logPath2 = "logs/2/2026-01-02/1/1/1/11";

      await createLog(1, 1, 10, logPath1);
      await createLog(2, 1, 11, logPath2);

      const openaiInput = {
        model: "o1-mini",
        input: [],
        text: {},
        reasoning: {},
      };

      const openaiOutput = {
        model: "o1-mini",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
        },
      };

      await r2.put(`${logPath1}/input.json`, JSON.stringify(openaiInput));
      await r2.put(`${logPath1}/output.json`, JSON.stringify(openaiOutput));
      await r2.put(`${logPath2}/input.json`, JSON.stringify(openaiInput));
      await r2.put(`${logPath2}/output.json`, JSON.stringify(openaiOutput));

      // Process tenant 1's log
      await service.processExecutionLog(1, 1, 10);

      // Verify only tenant 1's log was updated
      const log1 = await env.DB.prepare(
        "SELECT provider FROM PromptExecutionLogs WHERE id = ?"
      )
        .bind(10)
        .first<{ provider: string }>();

      const log2 = await env.DB.prepare(
        "SELECT provider FROM PromptExecutionLogs WHERE id = ?"
      )
        .bind(11)
        .first<{ provider: string | null }>();

      expect(log1?.provider).toBe("openai");
      expect(log2?.provider).toBeNull();
    });
  });
});
