import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TraceExtractionService, OptimisticLockError } from "../../../../worker/services/trace-extraction.service";
import { applyMigrations } from "../../helpers/db-setup";
import { traces, promptExecutionLogs } from "../../../../worker/db/schema";
import { eq, and } from "drizzle-orm";

describe("TraceExtractionService - extractTrace", () => {
  let service: TraceExtractionService;
  let db: ReturnType<typeof drizzle>;
  const tenantId = 1;
  const projectId = 1;
  const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    service = new TraceExtractionService(db, env.PRIVATE_FILES);
  });

  describe("successful extraction", () => {
    it("should extract trace from a single execution log", async () => {
      // Create execution log with traceId
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        durationMs: 1000,
        traceId,
        rawTraceId: `00-${traceId}-00f067aa0ba902b7-01`,
      });

      await service.extractTrace(tenantId, projectId, traceId);

      // Verify trace was created
      const [trace] = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      expect(trace).toBeDefined();
      expect(trace.totalLogs).toBe(1);
      expect(trace.successCount).toBe(1);
      expect(trace.errorCount).toBe(0);
      expect(trace.totalDurationMs).toBe(1000);
      expect(trace.firstLogAt).toBeDefined();
      expect(trace.lastLogAt).toBeDefined();
      expect(trace.tracePath).toContain(`traces/${tenantId}`);
      expect(trace.tracePath).toContain(`${projectId}/${traceId}`);
    });

    it("should extract trace from multiple execution logs", async () => {
      // Create multiple execution logs with same traceId
      await db.insert(promptExecutionLogs).values([
        {
          tenantId,
          projectId,
          promptId: 1,
          version: 1,
          isSuccess: true,
          durationMs: 1000,
          traceId,
        },
        {
          tenantId,
          projectId,
          promptId: 2,
          version: 1,
          isSuccess: true,
          durationMs: 2000,
          traceId,
        },
        {
          tenantId,
          projectId,
          promptId: 3,
          version: 1,
          isSuccess: false,
          durationMs: 500,
          errorMessage: "Test error",
          traceId,
        },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      expect(trace).toBeDefined();
      expect(trace.totalLogs).toBe(3);
      expect(trace.successCount).toBe(2);
      expect(trace.errorCount).toBe(1);
      expect(trace.totalDurationMs).toBe(3500);
    });

    it("should calculate correct firstLogAt and lastLogAt", async () => {
      const now = Math.floor(Date.now() / 1000);

      // Create logs with different timestamps
      await db.insert(promptExecutionLogs).values([
        {
          tenantId,
          projectId,
          promptId: 1,
          version: 1,
          isSuccess: true,
          traceId,
          createdAt: new Date((now - 100) * 1000), // oldest
        },
        {
          tenantId,
          projectId,
          promptId: 2,
          version: 1,
          isSuccess: true,
          traceId,
          createdAt: new Date((now - 50) * 1000),
        },
        {
          tenantId,
          projectId,
          promptId: 3,
          version: 1,
          isSuccess: true,
          traceId,
          createdAt: new Date(now * 1000), // newest
        },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      // Drizzle with mode: "timestamp" returns Date objects, convert to seconds
      const firstLogAtSeconds = trace.firstLogAt instanceof Date
        ? Math.floor(trace.firstLogAt.getTime() / 1000)
        : (trace.firstLogAt as number);

      const lastLogAtSeconds = trace.lastLogAt instanceof Date
        ? Math.floor(trace.lastLogAt.getTime() / 1000)
        : (trace.lastLogAt as number);

      expect(firstLogAtSeconds).toBe(now - 100);
      expect(lastLogAtSeconds).toBe(now);
    });

    it("should store trace data to R2", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        durationMs: 1000,
        traceId,
      });

      await service.extractTrace(tenantId, projectId, traceId);

      // Get trace to find R2 path
      const [trace] = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      expect(trace.tracePath).toBeDefined();

      // Verify R2 object exists
      const r2Object = await env.PRIVATE_FILES.get(`${trace.tracePath}/trace.json`);
      expect(r2Object).toBeDefined();

      const content = await r2Object!.text();
      const traceData = JSON.parse(content);

      expect(traceData.traceId).toBe(traceId);
      expect(traceData.tenantId).toBe(tenantId);
      expect(traceData.projectId).toBe(projectId);
      expect(traceData.stats).toBeDefined();
      expect(traceData.stats.totalLogs).toBe(1);
      expect(traceData.stats.successCount).toBe(1);
      expect(traceData.logs).toHaveLength(1);
      expect(traceData.extractedAt).toBeDefined();
    });

    it("should update existing trace record", async () => {
      // Create initial trace
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        durationMs: 1000,
        traceId,
      });

      await service.extractTrace(tenantId, projectId, traceId);

      const [initialTrace] = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      expect(initialTrace.totalLogs).toBe(1);

      // Add another log to the same trace
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 2,
        version: 1,
        isSuccess: true,
        durationMs: 2000,
        traceId,
      });

      // Extract again - should update existing record
      await service.extractTrace(tenantId, projectId, traceId);

      const [updatedTrace] = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      expect(updatedTrace.id).toBe(initialTrace.id); // Same record
      expect(updatedTrace.totalLogs).toBe(2); // Updated count
      expect(updatedTrace.totalDurationMs).toBe(3000); // Updated duration
    });
  });

  describe("edge cases", () => {
    it("should handle empty traceId gracefully", async () => {
      await expect(
        service.extractTrace(tenantId, projectId, "")
      ).resolves.not.toThrow();

      // Should not create any trace
      const allTraces = await db.select().from(traces);
      expect(allTraces).toHaveLength(0);
    });

    it("should handle trace with no logs", async () => {
      const nonExistentTraceId = "ffffffffffffffffffffffffffffffff";

      // Should not throw, just return early
      await expect(
        service.extractTrace(tenantId, projectId, nonExistentTraceId)
      ).resolves.not.toThrow();

      // Should not create trace
      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, nonExistentTraceId))
        .limit(1);

      expect(trace).toBeUndefined();
    });

    it("should handle logs without durationMs", async () => {
      await db.insert(promptExecutionLogs).values([
        {
          tenantId,
          projectId,
          promptId: 1,
          version: 1,
          isSuccess: true,
          traceId,
          durationMs: null,
        },
        {
          tenantId,
          projectId,
          promptId: 2,
          version: 1,
          isSuccess: true,
          traceId,
          durationMs: 1000,
        },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(trace.totalLogs).toBe(2);
      expect(trace.totalDurationMs).toBe(1000); // Only counts non-null
    });

    it("should only aggregate logs for the correct tenant and project", async () => {
      const otherTenantId = 2;
      const otherProjectId = 2;

      // Create logs in different tenant/project
      await db.insert(promptExecutionLogs).values([
        {
          tenantId,
          projectId,
          promptId: 1,
          version: 1,
          isSuccess: true,
          traceId,
        },
        {
          tenantId: otherTenantId,
          projectId,
          promptId: 1,
          version: 1,
          isSuccess: true,
          traceId, // Same traceId, different tenant
        },
        {
          tenantId,
          projectId: otherProjectId,
          promptId: 1,
          version: 1,
          isSuccess: true,
          traceId, // Same traceId, different project
        },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      // Should only count logs from the correct tenant/project
      expect(trace.totalLogs).toBe(1);
    });
  });

  describe("cross-tenant protection", () => {
    it("should not aggregate logs from different tenants", async () => {
      const tenant1 = 1;
      const tenant2 = 2;

      await db.insert(promptExecutionLogs).values([
        {
          tenantId: tenant1,
          projectId,
          promptId: 1,
          version: 1,
          isSuccess: true,
          traceId,
        },
        {
          tenantId: tenant2,
          projectId,
          promptId: 1,
          version: 1,
          isSuccess: true,
          traceId,
        },
      ]);

      await service.extractTrace(tenant1, projectId, traceId);

      // Verify tenant1 trace only has their log
      const [tenant1Trace] = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenant1),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      expect(tenant1Trace.totalLogs).toBe(1);

      // Verify tenant2 has no trace yet
      const [tenant2Trace] = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenant2),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      expect(tenant2Trace).toBeUndefined();
    });
  });
});
