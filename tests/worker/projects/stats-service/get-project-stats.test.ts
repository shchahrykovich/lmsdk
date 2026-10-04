import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DAILY_WINDOW_DAYS, ProjectStatsService } from "../../../../worker/projects/project-stats.service";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";
import { insertDataSet, insertEvaluation, insertLog, insertPrompt, insertTrace } from "../stats-fixtures";

const now = new Date("2026-09-14T15:00:00Z");

describe("ProjectStatsService - getProjectStats", () => {
  let service: ProjectStatsService;

  beforeEach(async () => {
    await applyMigrations();
    service = new ProjectStatsService(env.DB);
  });

  it("returns zero stats and an empty daily series for a project without data", async () => {
    const result = await service.getProjectStats(new ProjectId(10, 1, "user-1"), now);

    expect(result.stats).toEqual({
      prompts: 0,
      executions: {
        total: 0,
        succeeded: 0,
        failed: 0,
        avgDurationMs: null,
        totalTokens: 0,
        lastExecutionAt: null,
      },
      traces: 0,
      datasets: 0,
      datasetRecords: 0,
      evaluations: 0,
    });
    expect(result.daily).toHaveLength(DAILY_WINDOW_DAYS);
    expect(result.daily.every((day) => day.total === 0 && day.failed === 0)).toBe(true);
  });

  it("combines counts from every table into one project summary", async () => {
    await insertPrompt(1, 10);
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, durationMs: 100, totalTokens: 30, createdAt: now });
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: false, durationMs: 201, createdAt: now });
    await insertTrace(1, 10);
    await insertDataSet(1, 10, 4);
    await insertEvaluation(1, 10);

    const { stats } = await service.getProjectStats(new ProjectId(10, 1, "user-1"), now);

    expect(stats).toEqual({
      prompts: 1,
      executions: {
        total: 2,
        succeeded: 1,
        failed: 1,
        avgDurationMs: 151,
        totalTokens: 30,
        lastExecutionAt: new Date("2026-09-14T15:00:00Z"),
      },
      traces: 1,
      datasets: 1,
      datasetRecords: 4,
      evaluations: 1,
    });
  });

  it("returns 14 days that end today and fills days without executions with zero", async () => {
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: false, createdAt: new Date("2026-09-01T09:00:00Z") });
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, createdAt: new Date("2026-09-14T01:00:00Z") });
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, createdAt: new Date("2026-08-31T23:00:00Z") });

    const { daily } = await service.getProjectStats(new ProjectId(10, 1, "user-1"), now);

    expect(daily[0]).toEqual({ date: "2026-09-01", total: 1, failed: 1 });
    expect(daily[1]).toEqual({ date: "2026-09-02", total: 0, failed: 0 });
    expect(daily[DAILY_WINDOW_DAYS - 1]).toEqual({ date: "2026-09-14", total: 1, failed: 0 });
  });

  it("does not include data of another tenant with the same project id", async () => {
    await insertPrompt(2, 10);
    await insertLog({ tenantId: 2, projectId: 10, isSuccess: true, createdAt: now });
    await insertTrace(2, 10);

    const result = await service.getProjectStats(new ProjectId(10, 1, "user-1"), now);

    expect(result.stats.prompts).toBe(0);
    expect(result.stats.executions.total).toBe(0);
    expect(result.stats.traces).toBe(0);
    expect(result.daily.every((day) => day.total === 0)).toBe(true);
  });
});
