import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TraceService } from "../../../../worker/services/traces.service";
import { applyMigrations } from "../../helpers/db-setup";
import { traces, promptExecutionLogs } from "../../../../worker/db/schema";
import type { Trace } from "../../../../worker/db/schema";

describe("TraceService - listProjectTraces", () => {
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

  describe("Basic Functionality", () => {
    it("returns empty array when no traces exist for project", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 10);

      expect(result.traces).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(0);
    });

    it("returns all traces for a specific project", async () => {
      // Create traces for project 42
      await createTrace(1, 42, "trace-1", { totalLogs: 5 });
      await createTrace(1, 42, "trace-2", { totalLogs: 3 });

      // Create trace for different project (should not be returned)
      await createTrace(1, 99, "trace-3", { totalLogs: 2 });

      const result = await traceService.listProjectTraces(1, 42, 1, 10);

      expect(result.traces).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.traces.every(t => t.projectId === 42)).toBe(true);
      expect(result.traces.map(t => t.traceId).sort()).toEqual(["trace-1", "trace-2"]);

      // Verify with direct SQL
      const dbResult = await env.DB.prepare(
        "SELECT * FROM Traces WHERE tenantId = ? AND projectId = ?"
      )
        .bind(1, 42)
        .all<Trace>();

      expect(dbResult.results).toHaveLength(2);
    });

    it("returns traces with correct pagination defaults", async () => {
      // Create 25 traces
      for (let i = 1; i <= 25; i++) {
        await createTrace(1, 42, `trace-${i}`, { totalLogs: i });
      }

      const result = await traceService.listProjectTraces(1, 42, 1, 10);

      expect(result.traces).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(3);
    });
  });

  describe("Pagination", () => {
    beforeEach(async () => {
      // Create 25 traces for pagination tests
      for (let i = 1; i <= 25; i++) {
        await createTrace(1, 42, `trace-${String(i).padStart(2, "0")}`, {
          totalLogs: i,
        });
      }
    });

    it("returns first page correctly", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 10);

      expect(result.page).toBe(1);
      expect(result.traces).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
    });

    it("returns second page correctly", async () => {
      const result = await traceService.listProjectTraces(1, 42, 2, 10);

      expect(result.page).toBe(2);
      expect(result.traces).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
    });

    it("returns last page with remaining items", async () => {
      const result = await traceService.listProjectTraces(1, 42, 3, 10);

      expect(result.page).toBe(3);
      expect(result.traces).toHaveLength(5);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
    });

    it("returns empty array for page beyond total pages", async () => {
      const result = await traceService.listProjectTraces(1, 42, 10, 10);

      expect(result.page).toBe(10);
      expect(result.traces).toHaveLength(0);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
    });

    it("handles custom page size", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 5);

      expect(result.traces).toHaveLength(5);
      expect(result.pageSize).toBe(5);
      expect(result.totalPages).toBe(5);
    });

    it("calculates totalPages correctly with exact division", async () => {
      // Total 25, page size 5 = exactly 5 pages
      const result = await traceService.listProjectTraces(1, 42, 1, 5);

      expect(result.totalPages).toBe(5);
    });

    it("calculates totalPages correctly with remainder", async () => {
      // Total 25, page size 7 = 4 pages (7+7+7+4)
      const result = await traceService.listProjectTraces(1, 42, 1, 7);

      expect(result.totalPages).toBe(4);
    });
  });

  describe("Sorting", () => {
    beforeEach(async () => {
      // Create traces with different values for sorting
      // Use delays to ensure different timestamps
      await createTrace(1, 42, "trace-a", {
        totalLogs: 5,
        totalDurationMs: 1000,
        firstLogAt: new Date("2024-01-01"),
        lastLogAt: new Date("2024-01-02"),
      });

      await new Promise(resolve => setTimeout(resolve, 1100));

      await createTrace(1, 42, "trace-b", {
        totalLogs: 10,
        totalDurationMs: 500,
        firstLogAt: new Date("2024-01-03"),
        lastLogAt: new Date("2024-01-04"),
      });

      await new Promise(resolve => setTimeout(resolve, 1100));

      await createTrace(1, 42, "trace-c", {
        totalLogs: 3,
        totalDurationMs: 2000,
        firstLogAt: new Date("2024-01-05"),
        lastLogAt: new Date("2024-01-06"),
      });
    });

    it("sorts by createdAt descending by default", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 10);

      expect(result.traces).toHaveLength(3);
      // Most recent first
      expect(result.traces[0].traceId).toBe("trace-c");
      expect(result.traces[1].traceId).toBe("trace-b");
      expect(result.traces[2].traceId).toBe("trace-a");
    });

    it("sorts by createdAt ascending", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 10, {
        field: "createdAt",
        direction: "asc",
      });

      expect(result.traces).toHaveLength(3);
      expect(result.traces[0].traceId).toBe("trace-a");
      expect(result.traces[1].traceId).toBe("trace-b");
      expect(result.traces[2].traceId).toBe("trace-c");
    });

    it("sorts by totalLogs descending", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 10, {
        field: "totalLogs",
        direction: "desc",
      });

      expect(result.traces).toHaveLength(3);
      expect(result.traces[0].traceId).toBe("trace-b"); // 10 logs
      expect(result.traces[1].traceId).toBe("trace-a"); // 5 logs
      expect(result.traces[2].traceId).toBe("trace-c"); // 3 logs
    });

    it("sorts by totalLogs ascending", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 10, {
        field: "totalLogs",
        direction: "asc",
      });

      expect(result.traces).toHaveLength(3);
      expect(result.traces[0].traceId).toBe("trace-c"); // 3 logs
      expect(result.traces[1].traceId).toBe("trace-a"); // 5 logs
      expect(result.traces[2].traceId).toBe("trace-b"); // 10 logs
    });

    it("sorts by totalDurationMs descending", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 10, {
        field: "totalDurationMs",
        direction: "desc",
      });

      expect(result.traces).toHaveLength(3);
      expect(result.traces[0].traceId).toBe("trace-c"); // 2000ms
      expect(result.traces[1].traceId).toBe("trace-a"); // 1000ms
      expect(result.traces[2].traceId).toBe("trace-b"); // 500ms
    });

    it("sorts by totalDurationMs ascending", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 10, {
        field: "totalDurationMs",
        direction: "asc",
      });

      expect(result.traces).toHaveLength(3);
      expect(result.traces[0].traceId).toBe("trace-b"); // 500ms
      expect(result.traces[1].traceId).toBe("trace-a"); // 1000ms
      expect(result.traces[2].traceId).toBe("trace-c"); // 2000ms
    });

    it("sorts by firstLogAt descending", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 10, {
        field: "firstLogAt",
        direction: "desc",
      });

      expect(result.traces).toHaveLength(3);
      expect(result.traces[0].traceId).toBe("trace-c"); // 2024-01-05
      expect(result.traces[1].traceId).toBe("trace-b"); // 2024-01-03
      expect(result.traces[2].traceId).toBe("trace-a"); // 2024-01-01
    });

    it("sorts by lastLogAt ascending", async () => {
      const result = await traceService.listProjectTraces(1, 42, 1, 10, {
        field: "lastLogAt",
        direction: "asc",
      });

      expect(result.traces).toHaveLength(3);
      expect(result.traces[0].traceId).toBe("trace-a"); // 2024-01-02
      expect(result.traces[1].traceId).toBe("trace-b"); // 2024-01-04
      expect(result.traces[2].traceId).toBe("trace-c"); // 2024-01-06
    });
  });

  describe("Cross-tenant Protection", () => {
    it("only returns traces for the specified tenant", async () => {
      // Create traces for tenant 1
      await createTrace(1, 42, "tenant1-trace1");
      await createTrace(1, 42, "tenant1-trace2");

      // Create traces for tenant 2 (same project ID)
      await createTrace(2, 42, "tenant2-trace1");
      await createTrace(2, 42, "tenant2-trace2");

      const result = await traceService.listProjectTraces(1, 42, 1, 10);

      expect(result.traces).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.traces.every(t => t.tenantId === 1)).toBe(true);
      expect(result.traces.map(t => t.traceId).sort()).toEqual([
        "tenant1-trace1",
        "tenant1-trace2",
      ]);

      // Verify with direct SQL that tenant 2 data exists but is not returned
      const allTraces = await env.DB.prepare(
        "SELECT * FROM Traces WHERE projectId = ?"
      )
        .bind(42)
        .all<Trace>();

      expect(allTraces.results).toHaveLength(4);
    });

    it("returns empty array when requesting different tenant's project", async () => {
      // Create traces for tenant 1, project 42
      await createTrace(1, 42, "trace-1");
      await createTrace(1, 42, "trace-2");

      // Request with tenant 2
      const result = await traceService.listProjectTraces(2, 42, 1, 10);

      expect(result.traces).toEqual([]);
      expect(result.total).toBe(0);

      // Verify data exists for tenant 1
      const dbResult = await env.DB.prepare(
        "SELECT * FROM Traces WHERE tenantId = ? AND projectId = ?"
      )
        .bind(1, 42)
        .all<Trace>();

      expect(dbResult.results).toHaveLength(2);
    });

    it("maintains tenant isolation across multiple tenants and projects", async () => {
      // Create traces for multiple tenant/project combinations
      await createTrace(1, 10, "t1-p10-1");
      await createTrace(1, 10, "t1-p10-2");
      await createTrace(1, 20, "t1-p20-1");

      await createTrace(2, 10, "t2-p10-1");
      await createTrace(2, 20, "t2-p20-1");
      await createTrace(2, 20, "t2-p20-2");

      await createTrace(3, 10, "t3-p10-1");

      // Test tenant 1, project 10
      const t1p10 = await traceService.listProjectTraces(1, 10, 1, 10);
      expect(t1p10.total).toBe(2);
      expect(t1p10.traces.every(t => t.tenantId === 1 && t.projectId === 10)).toBe(true);

      // Test tenant 1, project 20
      const t1p20 = await traceService.listProjectTraces(1, 20, 1, 10);
      expect(t1p20.total).toBe(1);
      expect(t1p20.traces.every(t => t.tenantId === 1 && t.projectId === 20)).toBe(true);

      // Test tenant 2, project 20
      const t2p20 = await traceService.listProjectTraces(2, 20, 1, 10);
      expect(t2p20.total).toBe(2);
      expect(t2p20.traces.every(t => t.tenantId === 2 && t.projectId === 20)).toBe(true);

      // Test tenant 3, project 10
      const t3p10 = await traceService.listProjectTraces(3, 10, 1, 10);
      expect(t3p10.total).toBe(1);
      expect(t3p10.traces.every(t => t.tenantId === 3 && t.projectId === 10)).toBe(true);

      // Verify total count with direct SQL
      const totalCount = await env.DB.prepare("SELECT COUNT(*) as count FROM Traces")
        .first<{ count: number }>();

      expect(totalCount?.count).toBe(7);
    });

    it("pagination respects tenant boundaries", async () => {
      // Create 15 traces for tenant 1
      for (let i = 1; i <= 15; i++) {
        await createTrace(1, 42, `t1-trace-${i}`);
      }

      // Create 10 traces for tenant 2 (same project)
      for (let i = 1; i <= 10; i++) {
        await createTrace(2, 42, `t2-trace-${i}`);
      }

      // Request page 1 for tenant 1
      const page1 = await traceService.listProjectTraces(1, 42, 1, 10);
      expect(page1.traces).toHaveLength(10);
      expect(page1.total).toBe(15);
      expect(page1.traces.every(t => t.tenantId === 1)).toBe(true);

      // Request page 2 for tenant 1
      const page2 = await traceService.listProjectTraces(1, 42, 2, 10);
      expect(page2.traces).toHaveLength(5);
      expect(page2.total).toBe(15);
      expect(page2.traces.every(t => t.tenantId === 1)).toBe(true);

      // Verify with direct SQL
      const t1Count = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM Traces WHERE tenantId = ? AND projectId = ?"
      )
        .bind(1, 42)
        .first<{ count: number }>();

      expect(t1Count?.count).toBe(15);
    });

    it("sorting respects tenant boundaries", async () => {
      // Create traces for tenant 1 with different log counts
      await createTrace(1, 42, "t1-low", { totalLogs: 5 });
      await createTrace(1, 42, "t1-high", { totalLogs: 50 });

      // Create traces for tenant 2 with higher log counts
      await createTrace(2, 42, "t2-highest", { totalLogs: 100 });
      await createTrace(2, 42, "t2-mid", { totalLogs: 75 });

      // Sort tenant 1 by totalLogs desc
      const result = await traceService.listProjectTraces(1, 42, 1, 10, {
        field: "totalLogs",
        direction: "desc",
      });

      expect(result.traces).toHaveLength(2);
      expect(result.traces[0].traceId).toBe("t1-high"); // 50 (not t2-highest)
      expect(result.traces[1].traceId).toBe("t1-low"); // 5
      expect(result.traces.every(t => t.tenantId === 1)).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("handles traces with null timestamp fields", async () => {
      await createTrace(1, 42, "trace-with-nulls", {
        firstLogAt: undefined,
        lastLogAt: undefined,
      });

      const result = await traceService.listProjectTraces(1, 42, 1, 10);

      expect(result.traces).toHaveLength(1);
      expect(result.traces[0].firstLogAt).toBeNull();
      expect(result.traces[0].lastLogAt).toBeNull();
    });

    it("handles traces with zero counts", async () => {
      await createTrace(1, 42, "empty-trace", {
        totalLogs: 0,
        successCount: 0,
        errorCount: 0,
        totalDurationMs: 0,
      });

      const result = await traceService.listProjectTraces(1, 42, 1, 10);

      expect(result.traces).toHaveLength(1);
      expect(result.traces[0].totalLogs).toBe(0);
      expect(result.traces[0].successCount).toBe(0);
      expect(result.traces[0].errorCount).toBe(0);
    });

    it("handles very large page numbers gracefully", async () => {
      await createTrace(1, 42, "trace-1");

      const result = await traceService.listProjectTraces(1, 42, 999999, 10);

      expect(result.traces).toHaveLength(0);
      expect(result.page).toBe(999999);
      expect(result.total).toBe(1);
    });

    it("handles page size of 1", async () => {
      await createTrace(1, 42, "trace-1");
      await createTrace(1, 42, "trace-2");

      const result = await traceService.listProjectTraces(1, 42, 1, 1);

      expect(result.traces).toHaveLength(1);
      expect(result.pageSize).toBe(1);
      expect(result.totalPages).toBe(2);
    });
  });
});
