import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TraceService } from "../../../../worker/services/traces.service";
import { applyMigrations } from "../../helpers/db-setup";
import { traces, promptExecutionLogs, prompts } from "../../../../worker/db/schema";
import type { Trace, PromptExecutionLog } from "../../../../worker/db/schema";

describe("TraceService - getTraceDetails", () => {
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
    overrides: Partial<typeof traces.$inferInsert> = {}
  ) => {
    const now = new Date();
    const [trace] = await db
      .insert(traces)
      .values({
        tenantId,
        projectId,
        traceId,
        totalLogs: 0,
        successCount: 0,
        errorCount: 0,
        totalDurationMs: 0,
        firstLogAt: now,
        lastLogAt: now,
        tracePath: `traces/${tenantId}/${projectId}/${traceId}`,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .returning();
    return trace;
  };

  const createPrompt = async (
    tenantId: number,
    projectId: number,
    promptId: number,
    name: string,
    slug: string
  ) => {
    const now = new Date();
    const [prompt] = await db
      .insert(prompts)
      .values({
        id: promptId,
        tenantId,
        projectId,
        name,
        slug,
        provider: "openai",
        model: "gpt-4",
        body: "{}",
        latestVersion: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return prompt;
  };

  const createLog = async (
    tenantId: number,
    projectId: number,
    promptId: number,
    traceId: string,
    overrides: Partial<typeof promptExecutionLogs.$inferInsert> = {}
  ) => {
    const now = new Date();
    const [log] = await db
      .insert(promptExecutionLogs)
      .values({
        tenantId,
        projectId,
        promptId,
        version: 1,
        isSuccess: true,
        durationMs: 100,
        logPath: `logs/${tenantId}/${projectId}/${promptId}`,
        traceId,
        createdAt: now,
        ...overrides,
      })
      .returning();
    return log;
  };

  describe("Basic Functionality", () => {
    it("returns null when trace does not exist", async () => {
      const result = await traceService.getTraceDetails(1, 42, "non-existent");

      expect(result.trace).toBeNull();
      expect(result.logs).toEqual([]);
    });

    it("returns trace with empty logs array when trace has no logs", async () => {
      await createTrace(1, 42, "trace-abc");

      const result = await traceService.getTraceDetails(1, 42, "trace-abc");

      expect(result.trace).not.toBeNull();
      expect(result.trace?.traceId).toBe("trace-abc");
      expect(result.logs).toEqual([]);

      // Verify with direct SQL
      const dbTrace = await env.DB.prepare(
        "SELECT * FROM Traces WHERE traceId = ? AND tenantId = ? AND projectId = ?"
      )
        .bind("trace-abc", 1, 42)
        .first<Trace>();

      expect(dbTrace).not.toBeNull();
    });

    it("returns trace with associated logs", async () => {
      await createTrace(1, 42, "trace-abc", {
        totalLogs: 3,
        successCount: 2,
        errorCount: 1,
      });

      // Create logs for this trace
      await createLog(1, 42, 10, "trace-abc", {
        isSuccess: true,
        durationMs: 200,
      });
      await createLog(1, 42, 10, "trace-abc", {
        isSuccess: true,
        durationMs: 300,
      });
      await createLog(1, 42, 10, "trace-abc", {
        isSuccess: false,
        errorMessage: "API Error",
        durationMs: 100,
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-abc");

      expect(result.trace).not.toBeNull();
      expect(result.trace?.traceId).toBe("trace-abc");
      expect(result.trace?.totalLogs).toBe(3);
      expect(result.logs).toHaveLength(3);
      expect(result.logs.filter(l => l.isSuccess).length).toBe(2);
      expect(result.logs.filter(l => !l.isSuccess).length).toBe(1);

      // Verify with direct SQL
      const dbLogs = await env.DB.prepare(
        "SELECT * FROM PromptExecutionLogs WHERE traceId = ? AND tenantId = ? AND projectId = ?"
      )
        .bind("trace-abc", 1, 42)
        .all<PromptExecutionLog>();

      expect(dbLogs.results).toHaveLength(3);
    });

    it("returns logs ordered by createdAt ascending", async () => {
      await createTrace(1, 42, "trace-abc");

      // Create logs with different timestamps
      const log1 = await createLog(1, 42, 10, "trace-abc", {
        createdAt: new Date("2024-01-01T10:00:00Z"),
      });
      await new Promise(resolve => setTimeout(resolve, 10));

      const log2 = await createLog(1, 42, 10, "trace-abc", {
        createdAt: new Date("2024-01-01T10:05:00Z"),
      });
      await new Promise(resolve => setTimeout(resolve, 10));

      const log3 = await createLog(1, 42, 10, "trace-abc", {
        createdAt: new Date("2024-01-01T10:10:00Z"),
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-abc");

      expect(result.logs).toHaveLength(3);
      // Should be ordered by createdAt ascending
      expect(result.logs[0].id).toBe(log1.id);
      expect(result.logs[1].id).toBe(log2.id);
      expect(result.logs[2].id).toBe(log3.id);
    });

    it("includes all log fields in response", async () => {
      await createTrace(1, 42, "trace-abc");

      const createdLog = await createLog(1, 42, 10, "trace-abc", {
        version: 5,
        isSuccess: false,
        errorMessage: "Test error",
        durationMs: 500,
        logPath: "custom/log/path",
        rawTraceId: "raw-trace-id",
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-abc");

      expect(result.logs).toHaveLength(1);
      const log = result.logs[0];
      expect(log.id).toBe(createdLog.id);
      expect(log.promptId).toBe(10);
      expect(log.version).toBe(5);
      expect(log.isSuccess).toBe(false);
      expect(log.errorMessage).toBe("Test error");
      expect(log.durationMs).toBe(500);
      expect(log.traceId).toBe("trace-abc");
    });
  });

  describe("Cross-tenant Protection", () => {
    it("returns null when trace exists but belongs to different tenant", async () => {
      // Create trace for tenant 1
      await createTrace(1, 42, "trace-abc");
      await createLog(1, 42, 10, "trace-abc");

      // Try to access with tenant 2
      const result = await traceService.getTraceDetails(2, 42, "trace-abc");

      expect(result.trace).toBeNull();
      expect(result.logs).toEqual([]);

      // Verify trace exists in database
      const dbTrace = await env.DB.prepare(
        "SELECT * FROM Traces WHERE traceId = ?"
      )
        .bind("trace-abc")
        .first<Trace>();

      expect(dbTrace).not.toBeNull();
      expect(dbTrace?.tenantId).toBe(1);
    });

    it("returns null when trace exists for different project", async () => {
      // Create trace for project 42
      await createTrace(1, 42, "trace-abc");
      await createLog(1, 42, 10, "trace-abc");

      // Try to access with project 99
      const result = await traceService.getTraceDetails(1, 99, "trace-abc");

      expect(result.trace).toBeNull();
      expect(result.logs).toEqual([]);

      // Verify trace exists for project 42
      const dbTrace = await env.DB.prepare(
        "SELECT * FROM Traces WHERE traceId = ? AND projectId = ?"
      )
        .bind("trace-abc", 42)
        .first<Trace>();

      expect(dbTrace).not.toBeNull();
    });

    it("only returns logs belonging to the same tenant", async () => {
      // Create trace and logs for tenant 1
      await createTrace(1, 42, "shared-trace");
      await createLog(1, 42, 10, "shared-trace");
      await createLog(1, 42, 10, "shared-trace");

      // Create logs for tenant 2 with same traceId (shouldn't happen in practice, but testing isolation)
      await createLog(2, 42, 10, "shared-trace");

      const result = await traceService.getTraceDetails(1, 42, "shared-trace");

      expect(result.trace).not.toBeNull();
      expect(result.logs).toHaveLength(2);
      expect(result.logs.every(l => l.tenantId === 1)).toBe(true);

      // Verify there are 3 logs total in database
      const allLogs = await env.DB.prepare(
        "SELECT * FROM PromptExecutionLogs WHERE traceId = ?"
      )
        .bind("shared-trace")
        .all<PromptExecutionLog>();

      expect(allLogs.results).toHaveLength(3);
    });

    it("enforces strict tenant isolation across multiple scenarios", async () => {
      // Setup: Create traces for multiple tenants
      await createTrace(1, 10, "t1-trace");
      await createLog(1, 10, 100, "t1-trace");
      await createLog(1, 10, 100, "t1-trace");

      await createTrace(2, 10, "t2-trace");
      await createLog(2, 10, 200, "t2-trace");
      await createLog(2, 10, 200, "t2-trace");
      await createLog(2, 10, 200, "t2-trace");

      await createTrace(3, 10, "t3-trace");
      await createLog(3, 10, 300, "t3-trace");

      // Each tenant can only access their own traces
      const t1Result = await traceService.getTraceDetails(1, 10, "t1-trace");
      expect(t1Result.trace).not.toBeNull();
      expect(t1Result.logs).toHaveLength(2);
      expect(t1Result.logs.every(l => l.tenantId === 1)).toBe(true);

      const t2Result = await traceService.getTraceDetails(2, 10, "t2-trace");
      expect(t2Result.trace).not.toBeNull();
      expect(t2Result.logs).toHaveLength(3);
      expect(t2Result.logs.every(l => l.tenantId === 2)).toBe(true);

      const t3Result = await traceService.getTraceDetails(3, 10, "t3-trace");
      expect(t3Result.trace).not.toBeNull();
      expect(t3Result.logs).toHaveLength(1);
      expect(t3Result.logs.every(l => l.tenantId === 3)).toBe(true);

      // Cross-tenant access returns null
      expect((await traceService.getTraceDetails(1, 10, "t2-trace")).trace).toBeNull();
      expect((await traceService.getTraceDetails(2, 10, "t1-trace")).trace).toBeNull();
      expect((await traceService.getTraceDetails(1, 10, "t3-trace")).trace).toBeNull();
    });

    it("validates both tenant and project match", async () => {
      // Create traces with same traceId but different tenant/project combinations
      await createTrace(1, 10, "duplicate-id");
      await createLog(1, 10, 100, "duplicate-id");

      await createTrace(1, 20, "duplicate-id");
      await createLog(1, 20, 200, "duplicate-id");

      await createTrace(2, 10, "duplicate-id");
      await createLog(2, 10, 300, "duplicate-id");

      // Each query should return the correct trace
      const t1p10 = await traceService.getTraceDetails(1, 10, "duplicate-id");
      expect(t1p10.trace).not.toBeNull();
      expect(t1p10.trace?.projectId).toBe(10);
      expect(t1p10.logs).toHaveLength(1);
      expect(t1p10.logs[0].promptId).toBe(100);

      const t1p20 = await traceService.getTraceDetails(1, 20, "duplicate-id");
      expect(t1p20.trace).not.toBeNull();
      expect(t1p20.trace?.projectId).toBe(20);
      expect(t1p20.logs).toHaveLength(1);
      expect(t1p20.logs[0].promptId).toBe(200);

      const t2p10 = await traceService.getTraceDetails(2, 10, "duplicate-id");
      expect(t2p10.trace).not.toBeNull();
      expect(t2p10.trace?.projectId).toBe(10);
      expect(t2p10.logs).toHaveLength(1);
      expect(t2p10.logs[0].promptId).toBe(300);

      // Wrong combinations return null
      expect((await traceService.getTraceDetails(2, 20, "duplicate-id")).trace).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    it("handles trace with many logs efficiently", async () => {
      await createTrace(1, 42, "large-trace", { totalLogs: 100 });

      // Create 100 logs
      for (let i = 0; i < 100; i++) {
        await createLog(1, 42, 10, "large-trace", {
          durationMs: i * 10,
        });
      }

      const result = await traceService.getTraceDetails(1, 42, "large-trace");

      expect(result.trace).not.toBeNull();
      expect(result.logs).toHaveLength(100);
      expect(result.logs.every(l => l.traceId === "large-trace")).toBe(true);
    });

    it("handles logs with null/undefined fields", async () => {
      await createTrace(1, 42, "trace-with-nulls");

      await createLog(1, 42, 10, "trace-with-nulls", {
        errorMessage: null,
        durationMs: null,
        logPath: null,
        rawTraceId: null,
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-with-nulls");

      expect(result.trace).not.toBeNull();
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].errorMessage).toBeNull();
      expect(result.logs[0].durationMs).toBeNull();
    });

    it("handles special characters in traceId", async () => {
      const specialTraceId = "trace-with-special-chars_123-456.789";
      await createTrace(1, 42, specialTraceId);
      await createLog(1, 42, 10, specialTraceId);

      const result = await traceService.getTraceDetails(1, 42, specialTraceId);

      expect(result.trace).not.toBeNull();
      expect(result.trace?.traceId).toBe(specialTraceId);
      expect(result.logs).toHaveLength(1);
    });

    it("handles logs from different prompts within same trace", async () => {
      await createTrace(1, 42, "multi-prompt-trace");
      const baseTime = new Date("2024-01-01T10:00:00Z");

      // Create prompts
      await createPrompt(1, 42, 10, "Summarize Text", "summarize-text");
      await createPrompt(1, 42, 20, "Analyze Sentiment", "analyze-sentiment");
      await createPrompt(1, 42, 30, "Extract Keywords", "extract-keywords");

      await createLog(1, 42, 10, "multi-prompt-trace", {
        version: 1,
        createdAt: baseTime,
      });
      await createLog(1, 42, 20, "multi-prompt-trace", {
        version: 2,
        createdAt: new Date("2024-01-01T10:05:00Z"),
      });
      await createLog(1, 42, 30, "multi-prompt-trace", {
        version: 1,
        createdAt: new Date("2024-01-01T10:10:00Z"),
      });

      const result = await traceService.getTraceDetails(1, 42, "multi-prompt-trace");

      expect(result.trace).not.toBeNull();
      expect(result.logs).toHaveLength(3);
      expect(new Set(result.logs.map(l => l.promptId)).size).toBe(3);

      // Verify prompt names and slugs are included
      expect(result.logs[0].promptName).toBe("Summarize Text");
      expect(result.logs[0].promptSlug).toBe("summarize-text");
      expect(result.logs[1].promptName).toBe("Analyze Sentiment");
      expect(result.logs[1].promptSlug).toBe("analyze-sentiment");
      expect(result.logs[2].promptName).toBe("Extract Keywords");
      expect(result.logs[2].promptSlug).toBe("extract-keywords");
    });

    it("returns logs with success and error mixed", async () => {
      await createTrace(1, 42, "mixed-trace", {
        totalLogs: 5,
        successCount: 3,
        errorCount: 2,
      });

      await createLog(1, 42, 10, "mixed-trace", { isSuccess: true });
      await createLog(1, 42, 10, "mixed-trace", {
        isSuccess: false,
        errorMessage: "Error 1",
      });
      await createLog(1, 42, 10, "mixed-trace", { isSuccess: true });
      await createLog(1, 42, 10, "mixed-trace", {
        isSuccess: false,
        errorMessage: "Error 2",
      });
      await createLog(1, 42, 10, "mixed-trace", { isSuccess: true });

      const result = await traceService.getTraceDetails(1, 42, "mixed-trace");

      expect(result.trace).not.toBeNull();
      expect(result.logs).toHaveLength(5);

      const successes = result.logs.filter(l => l.isSuccess);
      const errors = result.logs.filter(l => !l.isSuccess);

      expect(successes).toHaveLength(3);
      expect(errors).toHaveLength(2);
      expect(errors.every(l => l.errorMessage)).toBe(true);
    });

    it("handles trace with tracePath set", async () => {
      const tracePath = "traces/1/2024-12-31/42/trace-abc/trace.json";
      await createTrace(1, 42, "trace-abc", { tracePath });

      const result = await traceService.getTraceDetails(1, 42, "trace-abc");

      expect(result.trace).not.toBeNull();
    });

    it("handles empty string traceId gracefully", async () => {
      const result = await traceService.getTraceDetails(1, 42, "");

      expect(result.trace).toBeNull();
      expect(result.logs).toEqual([]);
    });
  });

  describe("Prompt Information", () => {
    it("includes prompt name and slug when prompt exists", async () => {
      await createTrace(1, 42, "test-trace");
      await createPrompt(1, 42, 100, "Generate Summary", "generate-summary");
      await createLog(1, 42, 100, "test-trace");

      const result = await traceService.getTraceDetails(1, 42, "test-trace");

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].promptName).toBe("Generate Summary");
      expect(result.logs[0].promptSlug).toBe("generate-summary");
      expect(result.logs[0].promptId).toBe(100);
    });

    it("returns null for prompt name/slug when prompt does not exist", async () => {
      await createTrace(1, 42, "orphaned-log-trace");
      // Create log without creating corresponding prompt (orphaned log)
      await createLog(1, 42, 999, "orphaned-log-trace");

      const result = await traceService.getTraceDetails(1, 42, "orphaned-log-trace");

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].promptId).toBe(999);
      expect(result.logs[0].promptName).toBeNull();
      expect(result.logs[0].promptSlug).toBeNull();
    });

    it("correctly joins prompts across multiple logs", async () => {
      await createTrace(1, 42, "multi-log-trace");
      const baseTime = new Date("2024-01-02T10:00:00Z");

      // Create two prompts
      await createPrompt(1, 42, 10, "Prompt A", "prompt-a");
      await createPrompt(1, 42, 20, "Prompt B", "prompt-b");

      // Create multiple logs for each prompt
      await createLog(1, 42, 10, "multi-log-trace", {
        version: 1,
        createdAt: baseTime,
      });
      await createLog(1, 42, 10, "multi-log-trace", {
        version: 2,
        createdAt: new Date("2024-01-02T10:05:00Z"),
      });
      await createLog(1, 42, 20, "multi-log-trace", {
        version: 1,
        createdAt: new Date("2024-01-02T10:10:00Z"),
      });

      const result = await traceService.getTraceDetails(1, 42, "multi-log-trace");

      expect(result.logs).toHaveLength(3);

      // First two logs should have Prompt A info
      expect(result.logs[0].promptName).toBe("Prompt A");
      expect(result.logs[0].promptSlug).toBe("prompt-a");
      expect(result.logs[1].promptName).toBe("Prompt A");
      expect(result.logs[1].promptSlug).toBe("prompt-a");

      // Third log should have Prompt B info
      expect(result.logs[2].promptName).toBe("Prompt B");
      expect(result.logs[2].promptSlug).toBe("prompt-b");
    });

    it("only joins prompts from the same tenant", async () => {
      await createTrace(1, 42, "tenant-isolation-trace");

      // Create prompt for tenant 1
      await createPrompt(1, 42, 100, "Tenant 1 Prompt", "tenant-1-prompt");

      // Create prompt for tenant 2 with different ID
      await createPrompt(2, 42, 200, "Tenant 2 Prompt", "tenant-2-prompt");

      // Create log for tenant 1 using promptId 100
      await createLog(1, 42, 100, "tenant-isolation-trace");

      const result = await traceService.getTraceDetails(1, 42, "tenant-isolation-trace");

      expect(result.logs).toHaveLength(1);
      // Should match tenant 1 prompt, not tenant 2
      expect(result.logs[0].promptName).toBe("Tenant 1 Prompt");
      expect(result.logs[0].promptSlug).toBe("tenant-1-prompt");
    });

    it("handles mixed scenario with some prompts existing and some not", async () => {
      await createTrace(1, 42, "mixed-prompts-trace");
      const baseTime = new Date("2024-01-03T10:00:00Z");

      // Create only one of two prompts
      await createPrompt(1, 42, 10, "Existing Prompt", "existing-prompt");

      await createLog(1, 42, 10, "mixed-prompts-trace", { createdAt: baseTime }); // Has prompt
      await createLog(1, 42, 999, "mixed-prompts-trace", {
        createdAt: new Date("2024-01-03T10:05:00Z"),
      }); // No prompt

      const result = await traceService.getTraceDetails(1, 42, "mixed-prompts-trace");

      expect(result.logs).toHaveLength(2);

      // First log should have prompt info
      expect(result.logs[0].promptName).toBe("Existing Prompt");
      expect(result.logs[0].promptSlug).toBe("existing-prompt");

      // Second log should have nulls
      expect(result.logs[1].promptName).toBeNull();
      expect(result.logs[1].promptSlug).toBeNull();
    });
  });

  describe("Span Extraction", () => {
    it("parses rawTraceId and returns span data", async () => {
      await createTrace(1, 42, "trace-123");

      const rawTraceId = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      await createLog(1, 42, 10, "trace-123", {
        rawTraceId,
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-123");

      expect(result.logs).toHaveLength(1);
      const log = result.logs[0];

      expect(log.trace).not.toBeNull();
      expect(log.trace?.version).toBe("00");
      expect(log.trace?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
      expect(log.trace?.spanId).toBe("00f067aa0ba902b7");
      expect(log.trace?.traceFlags).toBe("01");
      expect(log.trace?.sampled).toBe(true);
    });

    it("returns null span when rawTraceId is null", async () => {
      await createTrace(1, 42, "trace-123");

      await createLog(1, 42, 10, "trace-123", {
        rawTraceId: null,
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-123");

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].span).toBeNull();
    });

    it("returns null span when rawTraceId is invalid", async () => {
      await createTrace(1, 42, "trace-123");

      await createLog(1, 42, 10, "trace-123", {
        rawTraceId: "invalid-trace-id",
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-123");

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].span).toBeNull();
    });

    it("correctly parses sampled flag from traceFlags", async () => {
      await createTrace(1, 42, "trace-123");

      // Create logs with different sampled flags
      const baseTime = new Date("2024-01-01T10:00:00Z");
      await createLog(1, 42, 10, "trace-123", {
        rawTraceId: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00", // sampled=false
        createdAt: baseTime,
      });

      await createLog(1, 42, 10, "trace-123", {
        rawTraceId: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b8-01", // sampled=true
        createdAt: new Date("2024-01-01T10:05:00Z"),
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-123");

      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].span?.sampled).toBe(false);
      expect(result.logs[0].span?.traceFlags).toBe("00");
      expect(result.logs[1].span?.sampled).toBe(true);
      expect(result.logs[1].span?.traceFlags).toBe("01");
    });

    it("handles mixed logs with and without rawTraceId", async () => {
      await createTrace(1, 42, "trace-123");
      const baseTime = new Date("2024-01-01T10:00:00Z");

      await createLog(1, 42, 10, "trace-123", {
        rawTraceId: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        createdAt: baseTime,
      });

      await createLog(1, 42, 10, "trace-123", {
        rawTraceId: null,
        createdAt: new Date("2024-01-01T10:05:00Z"),
      });

      await createLog(1, 42, 10, "trace-123", {
        rawTraceId: "00-5bf92f3577b34da6a3ce929d0e0e4737-00f067aa0ba902b8-00",
        createdAt: new Date("2024-01-01T10:10:00Z"),
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-123");

      expect(result.logs).toHaveLength(3);

      // First log has span
      expect(result.logs[0].span).not.toBeNull();
      expect(result.logs[0].span?.spanId).toBe("00f067aa0ba902b7");

      // Second log has no span
      expect(result.logs[1].span).toBeNull();

      // Third log has span with different ID
      expect(result.logs[2].span).not.toBeNull();
      expect(result.logs[2].span?.spanId).toBe("00f067aa0ba902b8");
      expect(result.logs[2].span?.traceId).toBe("5bf92f3577b34da6a3ce929d0e0e4737");
    });

    it("preserves all span fields when parsing", async () => {
      await createTrace(1, 42, "trace-123");

      const rawTraceId = "ff-ffffffffffffffffffffffffffffffff-ffffffffffffffff-fe";
      await createLog(1, 42, 10, "trace-123", {
        rawTraceId,
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-123");

      expect(result.logs).toHaveLength(1);
      const span = result.logs[0].span;

      expect(span).not.toBeNull();
      expect(span?.version).toBe("ff");
      expect(span?.traceId).toBe("ffffffffffffffffffffffffffffffff");
      expect(span?.spanId).toBe("ffffffffffffffff");
      expect(span?.traceFlags).toBe("fe");
      expect(span?.sampled).toBe(false); // 0xfe has bit 0 = 0
    });

    it("handles uppercase hex characters in rawTraceId", async () => {
      await createTrace(1, 42, "trace-123");

      const rawTraceId = "00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01";
      await createLog(1, 42, 10, "trace-123", {
        rawTraceId,
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-123");

      expect(result.logs).toHaveLength(1);
      const span = result.logs[0].span;

      expect(span).not.toBeNull();
      expect(span?.traceId).toBe("4BF92F3577B34DA6A3CE929D0E0E4736");
      expect(span?.spanId).toBe("00F067AA0BA902B7");
    });

    it("includes rawTraceId field in response even when parsed", async () => {
      await createTrace(1, 42, "trace-123");

      const rawTraceId = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      await createLog(1, 42, 10, "trace-123", {
        rawTraceId,
      });

      const result = await traceService.getTraceDetails(1, 42, "trace-123");

      expect(result.logs).toHaveLength(1);
      // Both rawTraceId and span should be present
      expect(result.logs[0].rawTraceId).toBe(rawTraceId);
      expect(result.logs[0].span).not.toBeNull();
    });
  });

  describe("Data Integrity", () => {
    it("returns complete trace metadata", async () => {
      const now = new Date();
      await createTrace(1, 42, "metadata-trace", {
        totalLogs: 10,
        successCount: 7,
        errorCount: 3,
        totalDurationMs: 5000,
        firstLogAt: new Date("2024-01-01"),
        lastLogAt: new Date("2024-01-02"),
        tracePath: "traces/1/2024-01-01/42/metadata-trace",
      });

      const result = await traceService.getTraceDetails(1, 42, "metadata-trace");

      expect(result.trace).not.toBeNull();
      expect(result.trace?.totalLogs).toBe(10);
      expect(result.trace?.successCount).toBe(7);
      expect(result.trace?.errorCount).toBe(3);
      expect(result.trace?.totalDurationMs).toBe(5000);
    });

    it("preserves log ordering in chronological order", async () => {
      await createTrace(1, 42, "ordered-trace");

      const timestamps = [
        new Date("2024-01-01T10:00:00Z"),
        new Date("2024-01-01T10:05:00Z"),
        new Date("2024-01-01T10:10:00Z"),
        new Date("2024-01-01T10:15:00Z"),
      ];

      for (const timestamp of timestamps) {
        await createLog(1, 42, 10, "ordered-trace", { createdAt: timestamp });
      }

      const result = await traceService.getTraceDetails(1, 42, "ordered-trace");

      expect(result.logs).toHaveLength(4);

      // Verify logs are in chronological order
      for (let i = 0; i < result.logs.length - 1; i++) {
        const current = new Date(result.logs[i].createdAt).getTime();
        const next = new Date(result.logs[i + 1].createdAt).getTime();
        expect(current).toBeLessThanOrEqual(next);
      }
    });
  });
});
