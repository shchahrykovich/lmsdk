import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { ProjectStatsService } from "../../../../worker/projects/project-stats.service";
import { applyMigrations } from "../../helpers/db-setup";
import { insertDataSet, insertLog, insertPrompt } from "../stats-fixtures";

const now = new Date("2026-09-14T15:00:00Z");

describe("ProjectStatsService - getTenantStats", () => {
  let service: ProjectStatsService;

  beforeEach(async () => {
    await applyMigrations();
    service = new ProjectStatsService(env.DB);
  });

  it("returns empty totals and no projects for a tenant without data", async () => {
    const result = await service.getTenantStats(1, now);

    expect(result.projects).toEqual([]);
    expect(result.totals.executions.total).toBe(0);
    expect(result.totals.executions.avgDurationMs).toBeNull();
  });

  it("returns stats per project and totals across all projects", async () => {
    await insertPrompt(1, 10);
    await insertPrompt(1, 20);
    await insertPrompt(1, 20);
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, durationMs: 100, totalTokens: 10, createdAt: new Date("2026-09-10T00:00:00Z") });
    await insertLog({ tenantId: 1, projectId: 20, isSuccess: false, durationMs: 300, totalTokens: 5, createdAt: new Date("2026-09-12T00:00:00Z") });
    await insertDataSet(1, 20, 3);

    const result = await service.getTenantStats(1, now);
    const byProject = new Map(result.projects.map((entry) => [entry.projectId, entry.stats]));

    expect(byProject.get(10)?.prompts).toBe(1);
    expect(byProject.get(10)?.executions.total).toBe(1);
    expect(byProject.get(20)?.prompts).toBe(2);
    expect(byProject.get(20)?.executions.failed).toBe(1);
    expect(byProject.get(20)?.datasetRecords).toBe(3);

    expect(result.totals.prompts).toBe(3);
    expect(result.totals.executions).toEqual({
      total: 2,
      succeeded: 1,
      failed: 1,
      avgDurationMs: 200,
      totalTokens: 15,
      costUsd: 0,
      unpricedCount: 2,
      lastExecutionAt: new Date("2026-09-12T00:00:00Z"),
    });
    expect(result.totals.datasets).toBe(1);
  });

  it("sums the cost per project and across all projects", async () => {
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, totalTokens: 10, cost: 1.25, createdAt: now });
    await insertLog({ tenantId: 1, projectId: 20, isSuccess: true, totalTokens: 10, cost: 0.5, createdAt: now });
    await insertLog({ tenantId: 1, projectId: 20, isSuccess: true, totalTokens: 10, createdAt: now });
    await insertLog({ tenantId: 2, projectId: 30, isSuccess: true, totalTokens: 10, cost: 100, createdAt: now });

    const result = await service.getTenantStats(1, now);
    const byProject = new Map(result.projects.map((entry) => [entry.projectId, entry.stats]));

    expect(byProject.get(10)?.executions).toMatchObject({ costUsd: 1.25, unpricedCount: 0 });
    expect(byProject.get(20)?.executions).toMatchObject({ costUsd: 0.5, unpricedCount: 1 });
    expect(result.totals.executions).toMatchObject({ costUsd: 1.75, unpricedCount: 1 });
  });

  it("weights the average duration by the number of timed executions", async () => {
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, durationMs: 100, createdAt: now });
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, durationMs: 100, createdAt: now });
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, durationMs: 100, createdAt: now });
    await insertLog({ tenantId: 1, projectId: 20, isSuccess: true, durationMs: 500, createdAt: now });
    await insertLog({ tenantId: 1, projectId: 20, isSuccess: true, durationMs: null, createdAt: now });

    const result = await service.getTenantStats(1, now);

    expect(result.totals.executions.avgDurationMs).toBe(200);
  });

  it("sums the daily series across projects", async () => {
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, createdAt: new Date("2026-09-14T01:00:00Z") });
    await insertLog({ tenantId: 1, projectId: 20, isSuccess: false, createdAt: new Date("2026-09-14T02:00:00Z") });

    const { daily } = await service.getTenantStats(1, now);

    expect(daily.at(-1)).toEqual({ date: "2026-09-14", total: 2, failed: 1 });
  });

  it("does not include projects of another tenant", async () => {
    await insertPrompt(1, 10);
    await insertPrompt(2, 30);
    await insertLog({ tenantId: 2, projectId: 30, isSuccess: true, createdAt: now });

    const result = await service.getTenantStats(1, now);

    expect(result.projects.map((entry) => entry.projectId)).toEqual([10]);
    expect(result.totals.executions.total).toBe(0);
    expect(result.daily.every((day) => day.total === 0)).toBe(true);
  });
});
