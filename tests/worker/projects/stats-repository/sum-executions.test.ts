import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { ProjectStatsRepository } from "../../../../worker/projects/project-stats.repository";
import { applyMigrations } from "../../helpers/db-setup";
import { insertLog } from "../stats-fixtures";

describe("ProjectStatsRepository - sumExecutions", () => {
  let repository: ProjectStatsRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new ProjectStatsRepository(env.DB);
  });

  it("returns no rows when the tenant has no executions", async () => {
    expect(await repository.sumExecutions({ tenantId: 1 })).toEqual([]);
  });

  it("sums executions, successes, durations and tokens per project", async () => {
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, durationMs: 100, totalTokens: 50 });
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: false, durationMs: 300 });
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, durationMs: null, totalTokens: 25 });
    await insertLog({ tenantId: 1, projectId: 20, isSuccess: true, durationMs: 40, totalTokens: 7 });

    const rows = await repository.sumExecutions({ tenantId: 1 });
    const byProject = new Map(rows.map((row) => [row.projectId, row]));

    expect(byProject.get(10)).toMatchObject({
      total: 3,
      succeeded: 2,
      durationSumMs: 400,
      timedCount: 2,
      totalTokens: 75,
    });
    expect(byProject.get(20)).toMatchObject({ total: 1, succeeded: 1, totalTokens: 7 });
  });

  it("returns the latest execution time as a Date", async () => {
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, createdAt: new Date("2026-09-01T10:00:00Z") });
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, createdAt: new Date("2026-09-03T12:00:00Z") });

    const [row] = await repository.sumExecutions({ tenantId: 1 });

    expect(row.lastExecutionAt).toEqual(new Date("2026-09-03T12:00:00Z"));
  });

  it("only returns the requested project when projectId is set", async () => {
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true });
    await insertLog({ tenantId: 1, projectId: 20, isSuccess: true });

    const rows = await repository.sumExecutions({ tenantId: 1, projectId: 20 });

    expect(rows.map((row) => row.projectId)).toEqual([20]);
  });

  it("does not count executions of another tenant", async () => {
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true });
    await insertLog({ tenantId: 2, projectId: 10, isSuccess: true });
    await insertLog({ tenantId: 2, projectId: 10, isSuccess: true });

    const rows = await repository.sumExecutions({ tenantId: 1, projectId: 10 });

    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(1);
    const allRows = await env.DB.prepare("SELECT COUNT(*) as count FROM PromptExecutionLogs").first<{ count: number }>();
    expect(allRows?.count).toBe(3);
  });
});
