import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TraceExtractionService, OptimisticLockError } from "../../../../worker/services/trace-extraction.service";
import { applyMigrations } from "../../helpers/db-setup";
import { traces, promptExecutionLogs } from "../../../../worker/db/schema";
import { eq, and, sql } from "drizzle-orm";

describe("TraceExtractionService - Optimistic Locking", () => {
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

  describe("concurrent updates", () => {
    it("should handle concurrent trace updates with retry", async () => {
      // Create initial execution log
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        durationMs: 1000,
        traceId,
      });

      // First extraction - creates the trace
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

      // Simulate concurrent worker: manually update the trace
      // This represents another worker updating the trace between read and write
      const futureTimestamp = Math.floor(Date.now() / 1000) + 1;
      await db
        .update(traces)
        .set({
          totalLogs: 5,
          updatedAt: new Date(futureTimestamp * 1000),
        })
        .where(eq(traces.id, initialTrace.id));

      // Add another log
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 2,
        version: 1,
        isSuccess: true,
        durationMs: 2000,
        traceId,
      });

      // Second extraction - should detect the conflict and retry
      // The retry should succeed and use the current data
      await service.extractTrace(tenantId, projectId, traceId);

      const [finalTrace] = await db
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

      // Should have processed both logs (retried and succeeded)
      expect(finalTrace.totalLogs).toBe(2);
      expect(finalTrace.totalDurationMs).toBe(3000);
    });

    it("should update updatedAt timestamp on successful update", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        traceId,
      });

      const beforeExtract = Math.floor(Date.now() / 1000);
      await service.extractTrace(tenantId, projectId, traceId);
      const afterExtract = Math.floor(Date.now() / 1000);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      // Drizzle with mode: "timestamp" returns Date objects
      const updatedAtSeconds = trace.updatedAt instanceof Date
        ? Math.floor(trace.updatedAt.getTime() / 1000)
        : (trace.updatedAt as number);

      expect(updatedAtSeconds).toBeGreaterThanOrEqual(beforeExtract);
      expect(updatedAtSeconds).toBeLessThanOrEqual(afterExtract);
    });

    it("should handle unique constraint violation on insert", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        traceId,
      });

      // Start two concurrent extractions
      const promise1 = service.extractTrace(tenantId, projectId, traceId);
      const promise2 = service.extractTrace(tenantId, projectId, traceId);

      // Both should eventually succeed (one inserts, one retries and updates)
      await expect(Promise.all([promise1, promise2])).resolves.not.toThrow();

      // Should have only one trace record
      const allTraces = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        );

      expect(allTraces).toHaveLength(1);
      expect(allTraces[0].totalLogs).toBe(1);
    });

    it.skip("should retry up to 3 times before failing", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        traceId,
      });

      // First extraction
      await service.extractTrace(tenantId, projectId, traceId);

      // Get the trace
      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      // Add a new log
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 2,
        version: 1,
        isSuccess: true,
        traceId,
      });

      // Spy on the database select to inject conflicts
      let readCount = 0;
      const originalSelect = db.select.bind(db);

      const selectSpy = vi.spyOn(db, 'select').mockImplementation((...args: any[]) => {
        const result = originalSelect(...args);

        // After each read (checking for updatedAt), update the trace to cause conflict
        // We do this for the verification queries (when checking if trace was updated)
        readCount++;
        if (readCount > 2 && readCount < 15) {
          // Update trace in background to simulate another worker
          // Use a slight delay to let the query complete first
          setTimeout(() => {
            db.update(traces)
              .set({ updatedAt: new Date((Math.floor(Date.now() / 1000) + readCount) * 1000) })
              .where(eq(traces.id, trace.id))
              .catch(() => {});
          }, 5);
        }

        return result;
      });

      try {
        // Should eventually fail after retries
        await expect(
          service.extractTrace(tenantId, projectId, traceId)
        ).rejects.toThrow(OptimisticLockError);

        expect(readCount).toBeGreaterThan(6); // Should have tried multiple times
      } finally {
        selectSpy.mockRestore();
      }
    });
  });

  describe("distributed processing", () => {
    it("should allow multiple workers to process different traces simultaneously", async () => {
      const traceId1 = "4bf92f3577b34da6a3ce929d0e0e4736";
      const traceId2 = "5cf92f3577b34da6a3ce929d0e0e4737";
      const traceId3 = "6cf92f3577b34da6a3ce929d0e0e4738";

      // Create logs for different traces
      await db.insert(promptExecutionLogs).values([
        {
          tenantId,
          projectId,
          promptId: 1,
          version: 1,
          isSuccess: true,
          traceId: traceId1,
        },
        {
          tenantId,
          projectId,
          promptId: 2,
          version: 1,
          isSuccess: true,
          traceId: traceId2,
        },
        {
          tenantId,
          projectId,
          promptId: 3,
          version: 1,
          isSuccess: true,
          traceId: traceId3,
        },
      ]);

      // Process all traces concurrently (simulating distributed workers)
      await Promise.all([
        service.extractTrace(tenantId, projectId, traceId1),
        service.extractTrace(tenantId, projectId, traceId2),
        service.extractTrace(tenantId, projectId, traceId3),
      ]);

      // All traces should be created successfully
      const allTraces = await db.select().from(traces);
      expect(allTraces).toHaveLength(3);

      const traces1 = allTraces.filter(t => t.traceId === traceId1);
      const traces2 = allTraces.filter(t => t.traceId === traceId2);
      const traces3 = allTraces.filter(t => t.traceId === traceId3);

      expect(traces1).toHaveLength(1);
      expect(traces2).toHaveLength(1);
      expect(traces3).toHaveLength(1);
    });

    it("should correctly aggregate when logs arrive out of order", async () => {
      // Create logs with different timestamps (simulating out-of-order arrival)
      const now = Math.floor(Date.now() / 1000);

      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        traceId,
        createdAt: new Date(now * 1000),
      });

      // First extraction
      await service.extractTrace(tenantId, projectId, traceId);

      // Add older log (arrived late)
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 2,
        version: 1,
        isSuccess: true,
        traceId,
        createdAt: new Date((now - 100) * 1000), // Earlier timestamp
      });

      // Second extraction
      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(trace.totalLogs).toBe(2);

      // firstLogAt should be the earlier timestamp
      // Drizzle with mode: "timestamp" returns Date objects
      const firstLogAtSeconds = trace.firstLogAt instanceof Date
        ? Math.floor(trace.firstLogAt.getTime() / 1000)
        : (trace.firstLogAt as number);

      expect(firstLogAtSeconds).toBe(now - 100);
    });

    it("should handle race condition when trace is deleted during processing", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        traceId,
      });

      // First extraction - creates trace
      await service.extractTrace(tenantId, projectId, traceId);

      const [initialTrace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(initialTrace.totalLogs).toBe(1);

      // Simulate trace deletion (or another worker deleted it)
      await db.delete(traces).where(eq(traces.id, initialTrace.id));

      // Add another log
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 2,
        version: 1,
        isSuccess: true,
        traceId,
      });

      // Second extraction should handle the missing trace by recreating it
      await service.extractTrace(tenantId, projectId, traceId);

      // Verify trace was recreated with both logs
      const [recreatedTrace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(recreatedTrace).toBeDefined();
      expect(recreatedTrace.totalLogs).toBe(2);
    });
  });

  describe("updatedAt consistency", () => {
    it("should maintain updatedAt consistency across retries", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        traceId,
      });

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace1] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      // Drizzle with mode: "timestamp" returns Date objects
      const updatedAt1 = trace1.updatedAt instanceof Date
        ? Math.floor(trace1.updatedAt.getTime() / 1000)
        : (trace1.updatedAt as number);

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Add another log and extract again
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 2,
        version: 1,
        isSuccess: true,
        traceId,
      });

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace2] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      const updatedAt2 = trace2.updatedAt instanceof Date
        ? Math.floor(trace2.updatedAt.getTime() / 1000)
        : (trace2.updatedAt as number);

      // updatedAt should have changed
      expect(updatedAt2).toBeGreaterThan(updatedAt1);
    });
  });
});
