import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TraceExtractionService } from "../../../../worker/services/trace-extraction.service";
import { applyMigrations } from "../../helpers/db-setup";
import { traces, promptExecutionLogs } from "../../../../worker/db/schema";
import { eq, and } from "drizzle-orm";

describe("TraceExtractionService - R2 Storage and Statistics", () => {
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

  describe("R2 storage", () => {
    it("should store trace data to R2 with correct path structure", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        traceId,
      });

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      // Verify path structure: traces/{tenantId}/{YYYY-MM-DD}/{projectId}/{traceId}
      expect(trace.tracePath).toMatch(/^traces\/\d+\/\d{4}-\d{2}-\d{2}\/\d+\/[a-f0-9]{32}$/);
      expect(trace.tracePath).toContain(`traces/${tenantId}`);
      expect(trace.tracePath).toContain(`${projectId}/${traceId}`);
    });

    it("should store complete trace data in R2", async () => {
      await db.insert(promptExecutionLogs).values([
        {
          tenantId,
          projectId,
          promptId: 1,
          version: 1,
          isSuccess: true,
          durationMs: 1000,
          traceId,
          logPath: "logs/path/1",
        },
        {
          tenantId,
          projectId,
          promptId: 2,
          version: 2,
          isSuccess: false,
          durationMs: 500,
          errorMessage: "Test error",
          traceId,
          logPath: "logs/path/2",
        },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      const r2Object = await env.PRIVATE_FILES.get(`${trace.tracePath}/trace.json`);
      expect(r2Object).toBeDefined();

      const content = await r2Object!.text();
      const traceData = JSON.parse(content);

      // Verify structure
      expect(traceData).toHaveProperty("traceId", traceId);
      expect(traceData).toHaveProperty("tenantId", tenantId);
      expect(traceData).toHaveProperty("projectId", projectId);
      expect(traceData).toHaveProperty("stats");
      expect(traceData).toHaveProperty("logs");
      expect(traceData).toHaveProperty("extractedAt");

      // Verify stats
      expect(traceData.stats.totalLogs).toBe(2);
      expect(traceData.stats.successCount).toBe(1);
      expect(traceData.stats.errorCount).toBe(1);
      expect(traceData.stats.totalDurationMs).toBe(1500);

      // Verify logs array
      expect(traceData.logs).toHaveLength(2);
      expect(traceData.logs[0]).toHaveProperty("id");
      expect(traceData.logs[0]).toHaveProperty("promptId");
      expect(traceData.logs[0]).toHaveProperty("version");
      expect(traceData.logs[0]).toHaveProperty("isSuccess");
      expect(traceData.logs[0]).toHaveProperty("logPath");
    });

    it("should update R2 data when trace is re-extracted", async () => {
      // Initial log
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

      const r2Object1 = await env.PRIVATE_FILES.get(`${trace1.tracePath}/trace.json`);
      const traceData1 = JSON.parse(await r2Object1!.text());
      expect(traceData1.logs).toHaveLength(1);

      // Wait to ensure timestamp changes (SQLite has 1-second resolution)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Add another log
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

      const r2Object2 = await env.PRIVATE_FILES.get(`${trace2.tracePath}/trace.json`);
      const traceData2 = JSON.parse(await r2Object2!.text());
      expect(traceData2.logs).toHaveLength(2);
    });

    it("should store trace data with proper content type", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        traceId,
      });

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      const r2Object = await env.PRIVATE_FILES.get(`${trace.tracePath}/trace.json`);
      expect(r2Object).toBeDefined();
      expect(r2Object!.httpMetadata?.contentType).toBe("application/json");

      // Consume the R2 object body to properly dispose of resources
      await r2Object!.text();
    });

    it("should include extraction timestamp in R2 data", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        traceId,
      });

      const beforeExtract = new Date();
      await service.extractTrace(tenantId, projectId, traceId);
      const afterExtract = new Date();

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      const r2Object = await env.PRIVATE_FILES.get(`${trace.tracePath}/trace.json`);
      const traceData = JSON.parse(await r2Object!.text());

      expect(traceData.extractedAt).toBeDefined();
      const extractedAt = new Date(traceData.extractedAt);
      expect(extractedAt.getTime()).toBeGreaterThanOrEqual(beforeExtract.getTime());
      expect(extractedAt.getTime()).toBeLessThanOrEqual(afterExtract.getTime());
    });
  });

  describe("statistics calculation", () => {
    it("should calculate totalLogs correctly", async () => {
      await db.insert(promptExecutionLogs).values([
        { tenantId, projectId, promptId: 1, version: 1, isSuccess: true, traceId },
        { tenantId, projectId, promptId: 2, version: 1, isSuccess: true, traceId },
        { tenantId, projectId, promptId: 3, version: 1, isSuccess: false, traceId },
        { tenantId, projectId, promptId: 4, version: 1, isSuccess: true, traceId },
        { tenantId, projectId, promptId: 5, version: 1, isSuccess: false, traceId },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(trace.totalLogs).toBe(5);
    });

    it("should calculate successCount and errorCount correctly", async () => {
      await db.insert(promptExecutionLogs).values([
        { tenantId, projectId, promptId: 1, version: 1, isSuccess: true, traceId },
        { tenantId, projectId, promptId: 2, version: 1, isSuccess: true, traceId },
        { tenantId, projectId, promptId: 3, version: 1, isSuccess: true, traceId },
        { tenantId, projectId, promptId: 4, version: 1, isSuccess: false, traceId },
        { tenantId, projectId, promptId: 5, version: 1, isSuccess: false, traceId },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(trace.successCount).toBe(3);
      expect(trace.errorCount).toBe(2);
    });

    it("should calculate totalDurationMs correctly", async () => {
      await db.insert(promptExecutionLogs).values([
        { tenantId, projectId, promptId: 1, version: 1, isSuccess: true, durationMs: 100, traceId },
        { tenantId, projectId, promptId: 2, version: 1, isSuccess: true, durationMs: 250, traceId },
        { tenantId, projectId, promptId: 3, version: 1, isSuccess: true, durationMs: 1500, traceId },
        { tenantId, projectId, promptId: 4, version: 1, isSuccess: false, durationMs: 50, traceId },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(trace.totalDurationMs).toBe(1900);
    });

    it("should handle null durationMs values", async () => {
      await db.insert(promptExecutionLogs).values([
        { tenantId, projectId, promptId: 1, version: 1, isSuccess: true, durationMs: 100, traceId },
        { tenantId, projectId, promptId: 2, version: 1, isSuccess: true, durationMs: null, traceId },
        { tenantId, projectId, promptId: 3, version: 1, isSuccess: true, durationMs: 200, traceId },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(trace.totalDurationMs).toBe(300); // Only counts non-null values
    });

    it("should calculate firstLogAt and lastLogAt correctly", async () => {
      const now = Math.floor(Date.now() / 1000);

      await db.insert(promptExecutionLogs).values([
        { tenantId, projectId, promptId: 1, version: 1, isSuccess: true, traceId, createdAt: new Date((now - 100) * 1000) },
        { tenantId, projectId, promptId: 2, version: 1, isSuccess: true, traceId, createdAt: new Date((now - 50) * 1000) },
        { tenantId, projectId, promptId: 3, version: 1, isSuccess: true, traceId, createdAt: new Date(now * 1000) },
        { tenantId, projectId, promptId: 4, version: 1, isSuccess: true, traceId, createdAt: new Date((now - 75) * 1000) },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
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

    it("should handle all success logs", async () => {
      await db.insert(promptExecutionLogs).values([
        { tenantId, projectId, promptId: 1, version: 1, isSuccess: true, traceId },
        { tenantId, projectId, promptId: 2, version: 1, isSuccess: true, traceId },
        { tenantId, projectId, promptId: 3, version: 1, isSuccess: true, traceId },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(trace.successCount).toBe(3);
      expect(trace.errorCount).toBe(0);
    });

    it("should handle all error logs", async () => {
      await db.insert(promptExecutionLogs).values([
        { tenantId, projectId, promptId: 1, version: 1, isSuccess: false, traceId },
        { tenantId, projectId, promptId: 2, version: 1, isSuccess: false, traceId },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(trace.successCount).toBe(0);
      expect(trace.errorCount).toBe(2);
    });

    it("should include error messages in R2 trace data", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: false,
        errorMessage: "Connection timeout",
        traceId,
      });

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      const r2Object = await env.PRIVATE_FILES.get(`${trace.tracePath}/trace.json`);
      const traceData = JSON.parse(await r2Object!.text());

      expect(traceData.logs[0].errorMessage).toBe("Connection timeout");
    });

    it("should handle zero duration logs", async () => {
      await db.insert(promptExecutionLogs).values([
        { tenantId, projectId, promptId: 1, version: 1, isSuccess: true, durationMs: 0, traceId },
        { tenantId, projectId, promptId: 2, version: 1, isSuccess: true, durationMs: 100, traceId },
      ]);

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      expect(trace.totalDurationMs).toBe(100);
    });
  });

  describe("R2 path generation", () => {
    it("should include current date in R2 path", async () => {
      await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId: 1,
        version: 1,
        isSuccess: true,
        traceId,
      });

      await service.extractTrace(tenantId, projectId, traceId);

      const [trace] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const expectedDate = `${year}-${month}-${day}`;

      expect(trace.tracePath).toContain(expectedDate);
    });

    it("should use consistent path format across multiple extractions", async () => {
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

      const path1 = trace1.tracePath;

      // Extract again
      await service.extractTrace(tenantId, projectId, traceId);

      const [trace2] = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId))
        .limit(1);

      const path2 = trace2.tracePath;

      // Path should be consistent (same day)
      expect(path1?.split('/').slice(0, 4).join('/')).toBe(path2?.split('/').slice(0, 4).join('/'));
    });
  });
});
