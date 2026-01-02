import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TraceService } from "../../../../worker/services/traces.service";
import { applyMigrations } from "../../helpers/db-setup";
import { traces } from "../../../../worker/db/schema";

describe("TraceService - Stats Parsing", () => {
  let traceService: TraceService;
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    traceService = new TraceService(db);
  });

  const createTrace = async (
    tenantId: number,
    projectId: number,
    traceId: string,
    stats: string | null
  ) => {
    const now = new Date();
    const [trace] = await db
      .insert(traces)
      .values({
        tenantId,
        projectId,
        traceId,
        totalLogs: 42,
        successCount: 40,
        errorCount: 2,
        totalDurationMs: 5000,
        stats,
        firstLogAt: now,
        lastLogAt: now,
        tracePath: `traces/${tenantId}/${projectId}/${traceId}`,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return trace;
  };

  describe("Stats JSON Parsing", () => {
    it("parses stats JSON string into object for OpenAI provider", async () => {
      const statsJson = JSON.stringify({
        providers: [
          {
            provider: "openai",
            models: [
              {
                model: "o1-mini",
                count: 5,
                tokens: {
                  input_tokens: 1500,
                  cached_tokens: 500,
                  output_tokens: 800,
                  reasoning_tokens: 300,
                  total_tokens: 2300,
                },
              },
            ],
          },
        ],
      });

      await createTrace(1, 42, "trace-openai", statsJson);

      const result = await traceService.getTraceDetails(1, 42, "trace-openai");

      expect(result.trace).not.toBeNull();
      expect(result.trace?.stats).not.toBeNull();
      expect(typeof result.trace?.stats).toBe("object");

      const stats = result.trace?.stats;
      expect(stats?.providers).toHaveLength(1);
      expect(stats?.providers[0].provider).toBe("openai");
      expect(stats?.providers[0].models).toHaveLength(1);
      expect(stats?.providers[0].models[0].model).toBe("o1-mini");
      expect(stats?.providers[0].models[0].count).toBe(5);
      expect(stats?.providers[0].models[0].tokens.input_tokens).toBe(1500);
      expect(stats?.providers[0].models[0].tokens.cached_tokens).toBe(500);
      expect(stats?.providers[0].models[0].tokens.output_tokens).toBe(800);
      expect(stats?.providers[0].models[0].tokens.reasoning_tokens).toBe(300);
      expect(stats?.providers[0].models[0].tokens.total_tokens).toBe(2300);
    });

    it("parses stats JSON string into object for Google provider", async () => {
      const statsJson = JSON.stringify({
        providers: [
          {
            provider: "google",
            models: [
              {
                model: "gemini-2.0-flash-thinking-exp",
                count: 10,
                tokens: {
                  prompt_tokens: 2000,
                  cached_tokens: 600,
                  response_tokens: 1200,
                  thoughts_tokens: 400,
                  tool_use_prompt_tokens: 100,
                  total_tokens: 3300,
                },
              },
            ],
          },
        ],
      });

      await createTrace(1, 42, "trace-google", statsJson);

      const result = await traceService.getTraceDetails(1, 42, "trace-google");

      expect(result.trace).not.toBeNull();
      expect(result.trace?.stats).not.toBeNull();

      const stats = result.trace?.stats;
      expect(stats?.providers).toHaveLength(1);
      expect(stats?.providers[0].provider).toBe("google");
      expect(stats?.providers[0].models).toHaveLength(1);
      expect(stats?.providers[0].models[0].model).toBe("gemini-2.0-flash-thinking-exp");
      expect(stats?.providers[0].models[0].count).toBe(10);
      expect(stats?.providers[0].models[0].tokens.prompt_tokens).toBe(2000);
      expect(stats?.providers[0].models[0].tokens.cached_tokens).toBe(600);
      expect(stats?.providers[0].models[0].tokens.response_tokens).toBe(1200);
      expect(stats?.providers[0].models[0].tokens.thoughts_tokens).toBe(400);
      expect(stats?.providers[0].models[0].tokens.tool_use_prompt_tokens).toBe(100);
      expect(stats?.providers[0].models[0].tokens.total_tokens).toBe(3300);
    });

    it("parses stats with multiple providers and models", async () => {
      const statsJson = JSON.stringify({
        providers: [
          {
            provider: "openai",
            models: [
              {
                model: "o1-mini",
                count: 5,
                tokens: {
                  input_tokens: 1500,
                  cached_tokens: 500,
                  output_tokens: 800,
                  reasoning_tokens: 300,
                  total_tokens: 2300,
                },
              },
              {
                model: "o1-preview",
                count: 3,
                tokens: {
                  input_tokens: 1000,
                  cached_tokens: 200,
                  output_tokens: 600,
                  reasoning_tokens: 150,
                  total_tokens: 1600,
                },
              },
            ],
          },
          {
            provider: "google",
            models: [
              {
                model: "gemini-2.0-flash",
                count: 12,
                tokens: {
                  prompt_tokens: 3000,
                  cached_tokens: 800,
                  response_tokens: 1500,
                  thoughts_tokens: 500,
                  tool_use_prompt_tokens: 200,
                  total_tokens: 4700,
                },
              },
            ],
          },
        ],
      });

      await createTrace(1, 42, "trace-multi", statsJson);

      const result = await traceService.getTraceDetails(1, 42, "trace-multi");

      expect(result.trace?.stats).not.toBeNull();

      const stats = result.trace?.stats;
      expect(stats?.providers).toHaveLength(2);

      // Verify OpenAI provider
      expect(stats?.providers[0].provider).toBe("openai");
      expect(stats?.providers[0].models).toHaveLength(2);

      // Verify Google provider
      expect(stats?.providers[1].provider).toBe("google");
      expect(stats?.providers[1].models).toHaveLength(1);
    });

    it("returns null for stats when stats field is null", async () => {
      await createTrace(1, 42, "trace-no-stats", null);

      const result = await traceService.getTraceDetails(1, 42, "trace-no-stats");

      expect(result.trace).not.toBeNull();
      expect(result.trace?.stats).toBeNull();
    });

    it("returns null for stats when stats is empty string", async () => {
      await createTrace(1, 42, "trace-empty-stats", "");

      const result = await traceService.getTraceDetails(1, 42, "trace-empty-stats");

      expect(result.trace).not.toBeNull();
      expect(result.trace?.stats).toBeNull();
    });

    it("handles invalid JSON gracefully", async () => {
      await createTrace(1, 42, "trace-invalid-json", "{invalid json}");

      // Should throw or handle parsing error
      await expect(async () => {
        await traceService.getTraceDetails(1, 42, "trace-invalid-json");
      }).rejects.toThrow();
    });

    it("preserves all token fields including zeros", async () => {
      const statsJson = JSON.stringify({
        providers: [
          {
            provider: "openai",
            models: [
              {
                model: "gpt-4",
                count: 1,
                tokens: {
                  input_tokens: 100,
                  cached_tokens: 0,
                  output_tokens: 50,
                  reasoning_tokens: 0,
                  total_tokens: 150,
                },
              },
            ],
          },
        ],
      });

      await createTrace(1, 42, "trace-with-zeros", statsJson);

      const result = await traceService.getTraceDetails(1, 42, "trace-with-zeros");

      const stats = result.trace?.stats;
      const tokens = stats?.providers[0].models[0].tokens;
      expect(tokens?.input_tokens).toBe(100);
      expect(tokens?.cached_tokens).toBe(0);
      expect(tokens?.output_tokens).toBe(50);
      expect(tokens?.reasoning_tokens).toBe(0);
      expect(tokens?.total_tokens).toBe(150);
    });
  });

  describe("List Traces Stats Parsing", () => {
    it("parses stats for multiple traces in list", async () => {
      const stats1 = JSON.stringify({
        providers: [
          {
            provider: "openai",
            models: [{ model: "o1-mini", count: 5, tokens: { total_tokens: 1000 } }],
          },
        ],
      });

      const stats2 = JSON.stringify({
        providers: [
          {
            provider: "google",
            models: [{ model: "gemini-2.0-flash", count: 3, tokens: { total_tokens: 500 } }],
          },
        ],
      });

      await createTrace(1, 42, "trace-1", stats1);
      await createTrace(1, 42, "trace-2", stats2);
      await createTrace(1, 42, "trace-3", null);

      const result = await traceService.listProjectTraces(1, 42, 1, 10);

      expect(result.traces).toHaveLength(3);

      // First trace has OpenAI stats
      expect(result.traces[0].stats).not.toBeNull();
      expect(result.traces[0].stats?.providers[0].provider).toBe("openai");

      // Second trace has Google stats
      expect(result.traces[1].stats).not.toBeNull();
      expect(result.traces[1].stats?.providers[0].provider).toBe("google");

      // Third trace has no stats
      expect(result.traces[2].stats).toBeNull();
    });
  });

  describe("Cross-tenant Protection with Stats", () => {
    it("only returns stats for traces belonging to tenant", async () => {
      const stats1 = JSON.stringify({
        providers: [
          {
            provider: "openai",
            models: [{ model: "o1-mini", count: 5, tokens: { total_tokens: 1000 } }],
          },
        ],
      });

      const stats2 = JSON.stringify({
        providers: [
          {
            provider: "google",
            models: [{ model: "gemini-2.0-flash", count: 3, tokens: { total_tokens: 500 } }],
          },
        ],
      });

      await createTrace(1, 42, "trace-t1", stats1);
      await createTrace(2, 42, "trace-t2", stats2);

      // Tenant 1 should only see their stats
      const result1 = await traceService.getTraceDetails(1, 42, "trace-t1");
      expect(result1.trace?.stats).not.toBeNull();
      expect(result1.trace?.stats?.providers[0].provider).toBe("openai");

      // Tenant 2 should only see their stats
      const result2 = await traceService.getTraceDetails(2, 42, "trace-t2");
      expect(result2.trace?.stats).not.toBeNull();
      expect(result2.trace?.stats?.providers[0].provider).toBe("google");

      // Cross-tenant access should return null
      const crossAccess = await traceService.getTraceDetails(1, 42, "trace-t2");
      expect(crossAccess.trace).toBeNull();
    });
  });
});
