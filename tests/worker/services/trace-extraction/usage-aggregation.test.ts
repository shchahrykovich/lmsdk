import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TraceExtractionService } from "../../../../worker/services/trace-extraction.service";
import { applyMigrations } from "../../helpers/db-setup";
import { traces, promptExecutionLogs } from "../../../../worker/db/schema";
import type { Trace } from "../../../../worker/db/schema";

describe("TraceExtractionService - Usage Aggregation", () => {
  let service: TraceExtractionService;
  let db: ReturnType<typeof drizzle>;
  let r2: R2Bucket;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    r2 = env.PRIVATE_FILES;
    service = new TraceExtractionService(db, r2);
  });

  const createLog = async (
    tenantId: number,
    projectId: number,
    traceId: string,
    provider: string,
    model: string,
    usage: any,
    overrides: Partial<typeof promptExecutionLogs.$inferInsert> = {}
  ) => {
    const [log] = await db
      .insert(promptExecutionLogs)
      .values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        traceId,
        isSuccess: true,
        durationMs: 100,
        provider,
        model,
        usage: JSON.stringify(usage),
        logPath: `logs/${tenantId}/${projectId}/${traceId}/1`,
        createdAt: new Date(),
        ...overrides,
      })
      .returning();
    return log;
  };

  describe("OpenAI Usage Aggregation", () => {
    it("aggregates usage from multiple OpenAI logs", async () => {
      const traceId = "trace-openai-multi";

      // Create 3 logs with different usage
      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 20 },
        output_tokens: 50,
        output_tokens_details: { reasoning_tokens: 10 },
        total_tokens: 150,
      });

      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 200,
        input_tokens_details: { cached_tokens: 50 },
        output_tokens: 100,
        output_tokens_details: { reasoning_tokens: 30 },
        total_tokens: 300,
      });

      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 150,
        input_tokens_details: { cached_tokens: 30 },
        output_tokens: 75,
        output_tokens_details: { reasoning_tokens: 20 },
        total_tokens: 225,
      });

      await service.extractTrace(1, 42, traceId);

      const dbTrace = await env.DB.prepare(
        "SELECT stats FROM Traces WHERE traceId = ? AND tenantId = ? AND projectId = ?"
      )
        .bind(traceId, 1, 42)
        .first<Trace>();

      expect(dbTrace).not.toBeNull();
      expect(dbTrace?.stats).not.toBeNull();

      const stats = JSON.parse(dbTrace!.stats!);
      expect(stats.providers).toHaveLength(1);
      expect(stats.providers[0].provider).toBe("openai");
      expect(stats.providers[0].models).toHaveLength(1);

      const modelStats = stats.providers[0].models[0];
      expect(modelStats.model).toBe("o1-mini");
      expect(modelStats.count).toBe(3);
      expect(modelStats.tokens.input_tokens).toBe(450); // 100 + 200 + 150
      expect(modelStats.tokens.cached_tokens).toBe(100); // 20 + 50 + 30
      expect(modelStats.tokens.output_tokens).toBe(225); // 50 + 100 + 75
      expect(modelStats.tokens.reasoning_tokens).toBe(60); // 10 + 30 + 20
      expect(modelStats.tokens.total_tokens).toBe(675); // 150 + 300 + 225
    });

    it("aggregates usage from multiple OpenAI models separately", async () => {
      const traceId = "trace-openai-models";

      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });

      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });

      await createLog(1, 42, traceId, "openai", "o1-preview", {
        input_tokens: 200,
        output_tokens: 100,
        total_tokens: 300,
      });

      await service.extractTrace(1, 42, traceId);

      const dbTrace = await env.DB.prepare(
        "SELECT stats FROM Traces WHERE traceId = ?"
      )
        .bind(traceId)
        .first<Trace>();

      const stats = JSON.parse(dbTrace!.stats!);
      expect(stats.providers).toHaveLength(1);
      expect(stats.providers[0].models).toHaveLength(2);

      // Find o1-mini stats
      const miniStats = stats.providers[0].models.find(
        (m: any) => m.model === "o1-mini"
      );
      expect(miniStats.count).toBe(2);
      expect(miniStats.tokens.total_tokens).toBe(300);

      // Find o1-preview stats
      const previewStats = stats.providers[0].models.find(
        (m: any) => m.model === "o1-preview"
      );
      expect(previewStats.count).toBe(1);
      expect(previewStats.tokens.total_tokens).toBe(300);
    });
  });

  describe("Google Usage Aggregation", () => {
    it("aggregates usage from multiple Google logs", async () => {
      const traceId = "trace-google-multi";

      await createLog(1, 42, traceId, "google", "gemini-2.0-flash", {
        prompt_tokens: 500,
        cached_tokens: 100,
        response_tokens: 200,
        thoughts_tokens: 50,
        tool_use_prompt_tokens: 20,
        total_tokens: 720,
      });

      await createLog(1, 42, traceId, "google", "gemini-2.0-flash", {
        prompt_tokens: 600,
        cached_tokens: 150,
        response_tokens: 250,
        thoughts_tokens: 75,
        tool_use_prompt_tokens: 30,
        total_tokens: 880,
      });

      await service.extractTrace(1, 42, traceId);

      const dbTrace = await env.DB.prepare(
        "SELECT stats FROM Traces WHERE traceId = ?"
      )
        .bind(traceId)
        .first<Trace>();

      const stats = JSON.parse(dbTrace!.stats!);
      expect(stats.providers).toHaveLength(1);
      expect(stats.providers[0].provider).toBe("google");

      const modelStats = stats.providers[0].models[0];
      expect(modelStats.model).toBe("gemini-2.0-flash");
      expect(modelStats.count).toBe(2);
      expect(modelStats.tokens.prompt_tokens).toBe(1100);
      expect(modelStats.tokens.cached_tokens).toBe(250);
      expect(modelStats.tokens.response_tokens).toBe(450);
      expect(modelStats.tokens.thoughts_tokens).toBe(125);
      expect(modelStats.tokens.tool_use_prompt_tokens).toBe(50);
      expect(modelStats.tokens.total_tokens).toBe(1600);
    });
  });

  describe("Mixed Provider Aggregation", () => {
    it("aggregates usage from multiple providers separately", async () => {
      const traceId = "trace-mixed-providers";

      // OpenAI logs
      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });

      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });

      // Google logs
      await createLog(1, 42, traceId, "google", "gemini-2.0-flash", {
        prompt_tokens: 500,
        response_tokens: 200,
        total_tokens: 700,
      });

      await service.extractTrace(1, 42, traceId);

      const dbTrace = await env.DB.prepare(
        "SELECT stats FROM Traces WHERE traceId = ?"
      )
        .bind(traceId)
        .first<Trace>();

      const stats = JSON.parse(dbTrace!.stats!);
      expect(stats.providers).toHaveLength(2);

      // Find OpenAI provider
      const openaiProvider = stats.providers.find((p: any) => p.provider === "openai");
      expect(openaiProvider).toBeDefined();
      expect(openaiProvider.models).toHaveLength(1);
      expect(openaiProvider.models[0].count).toBe(2);
      expect(openaiProvider.models[0].tokens.total_tokens).toBe(300);

      // Find Google provider
      const googleProvider = stats.providers.find((p: any) => p.provider === "google");
      expect(googleProvider).toBeDefined();
      expect(googleProvider.models).toHaveLength(1);
      expect(googleProvider.models[0].count).toBe(1);
      expect(googleProvider.models[0].tokens.total_tokens).toBe(700);
    });

    it("handles complex multi-provider multi-model scenario", async () => {
      const traceId = "trace-complex";

      // OpenAI: 2x o1-mini, 1x o1-preview
      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });

      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });

      await createLog(1, 42, traceId, "openai", "o1-preview", {
        input_tokens: 200,
        output_tokens: 100,
        total_tokens: 300,
      });

      // Google: 3x gemini-2.0-flash, 1x gemini-2.0-flash-thinking
      await createLog(1, 42, traceId, "google", "gemini-2.0-flash", {
        prompt_tokens: 500,
        response_tokens: 200,
        total_tokens: 700,
      });

      await createLog(1, 42, traceId, "google", "gemini-2.0-flash", {
        prompt_tokens: 500,
        response_tokens: 200,
        total_tokens: 700,
      });

      await createLog(1, 42, traceId, "google", "gemini-2.0-flash", {
        prompt_tokens: 500,
        response_tokens: 200,
        total_tokens: 700,
      });

      await createLog(1, 42, traceId, "google", "gemini-2.0-flash-thinking-exp", {
        prompt_tokens: 600,
        response_tokens: 300,
        thoughts_tokens: 100,
        total_tokens: 900,
      });

      await service.extractTrace(1, 42, traceId);

      const dbTrace = await env.DB.prepare(
        "SELECT stats FROM Traces WHERE traceId = ?"
      )
        .bind(traceId)
        .first<Trace>();

      const stats = JSON.parse(dbTrace!.stats!);
      expect(stats.providers).toHaveLength(2);

      // Verify OpenAI stats
      const openai = stats.providers.find((p: any) => p.provider === "openai");
      expect(openai.models).toHaveLength(2);

      // Verify Google stats
      const google = stats.providers.find((p: any) => p.provider === "google");
      expect(google.models).toHaveLength(2);

      const flashModel = google.models.find((m: any) => m.model === "gemini-2.0-flash");
      expect(flashModel.count).toBe(3);
      expect(flashModel.tokens.total_tokens).toBe(2100);

      const thinkingModel = google.models.find(
        (m: any) => m.model === "gemini-2.0-flash-thinking-exp"
      );
      expect(thinkingModel.count).toBe(1);
      expect(thinkingModel.tokens.thoughts_tokens).toBe(100);
    });
  });

  describe("Edge Cases", () => {
    it("handles logs without usage data", async () => {
      const traceId = "trace-no-usage";

      // Create log without provider/model/usage
      await db.insert(promptExecutionLogs).values({
        tenantId: 1,
        projectId: 42,
        promptId: 1,
        version: 1,
        traceId,
        isSuccess: true,
        durationMs: 100,
        createdAt: new Date(),
      });

      await service.extractTrace(1, 42, traceId);

      const dbTrace = await env.DB.prepare(
        "SELECT stats FROM Traces WHERE traceId = ?"
      )
        .bind(traceId)
        .first<Trace>();

      expect(dbTrace?.stats).toBeNull();
    });

    it("handles mixed logs with and without usage", async () => {
      const traceId = "trace-mixed-usage";

      // Log with usage
      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });

      // Log without usage
      await db.insert(promptExecutionLogs).values({
        tenantId: 1,
        projectId: 42,
        promptId: 1,
        version: 1,
        traceId,
        isSuccess: true,
        durationMs: 100,
        createdAt: new Date(),
      });

      await service.extractTrace(1, 42, traceId);

      const dbTrace = await env.DB.prepare(
        "SELECT stats FROM Traces WHERE traceId = ?"
      )
        .bind(traceId)
        .first<Trace>();

      const stats = JSON.parse(dbTrace!.stats!);
      expect(stats.providers).toHaveLength(1);
      expect(stats.providers[0].models[0].count).toBe(1);
    });

    it("handles logs with invalid usage JSON", async () => {
      const traceId = "trace-invalid-usage";

      const [log] = await db
        .insert(promptExecutionLogs)
        .values({
          tenantId: 1,
          projectId: 42,
          promptId: 1,
          version: 1,
          traceId,
          isSuccess: true,
          durationMs: 100,
          provider: "openai",
          model: "o1-mini",
          usage: "{invalid json}",
          createdAt: new Date(),
        })
        .returning();

      // Should not throw
      await expect(service.extractTrace(1, 42, traceId)).resolves.not.toThrow();
    });

    it("handles zero token counts correctly", async () => {
      const traceId = "trace-zero-tokens";

      await createLog(1, 42, traceId, "openai", "gpt-4", {
        input_tokens: 100,
        cached_tokens: 0,
        output_tokens: 50,
        reasoning_tokens: 0,
        total_tokens: 150,
      });

      await service.extractTrace(1, 42, traceId);

      const dbTrace = await env.DB.prepare(
        "SELECT stats FROM Traces WHERE traceId = ?"
      )
        .bind(traceId)
        .first<Trace>();

      const stats = JSON.parse(dbTrace!.stats!);
      const tokens = stats.providers[0].models[0].tokens;

      expect(tokens.cached_tokens).toBe(0);
      expect(tokens.reasoning_tokens).toBe(0);
    });
  });

  describe("Cross-tenant Protection", () => {
    it("only aggregates logs from same tenant", async () => {
      const traceId = "shared-trace-id";

      // Tenant 1 logs
      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });

      await createLog(1, 42, traceId, "openai", "o1-mini", {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });

      // Tenant 2 logs (shouldn't be included)
      await createLog(2, 42, traceId, "google", "gemini-2.0-flash", {
        prompt_tokens: 500,
        response_tokens: 200,
        total_tokens: 700,
      });

      await service.extractTrace(1, 42, traceId);

      const dbTrace = await env.DB.prepare(
        "SELECT stats FROM Traces WHERE traceId = ? AND tenantId = ?"
      )
        .bind(traceId, 1)
        .first<Trace>();

      const stats = JSON.parse(dbTrace!.stats!);

      // Should only have OpenAI stats from tenant 1
      expect(stats.providers).toHaveLength(1);
      expect(stats.providers[0].provider).toBe("openai");
      expect(stats.providers[0].models[0].count).toBe(2);
    });
  });
});
