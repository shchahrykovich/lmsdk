import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { ProjectStatsRepository } from "../../../../worker/projects/project-stats.repository";
import { applyMigrations } from "../../helpers/db-setup";
import { insertLog } from "../stats-fixtures";

describe("ProjectStatsRepository - countDailyExecutions", () => {
  let repository: ProjectStatsRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new ProjectStatsRepository(env.DB);
  });

  it("groups executions by UTC day and counts failures", async () => {
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, createdAt: new Date("2026-09-02T00:30:00Z") });
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: false, createdAt: new Date("2026-09-02T23:30:00Z") });
    await insertLog({ tenantId: 1, projectId: 20, isSuccess: false, createdAt: new Date("2026-09-03T08:00:00Z") });

    const rows = await repository.countDailyExecutions({ tenantId: 1 }, new Date("2026-09-01T00:00:00Z"));

    expect(rows).toEqual([
      { day: "2026-09-02", total: 2, failed: 1 },
      { day: "2026-09-03", total: 1, failed: 1 },
    ]);
  });

  it("skips executions before the start date", async () => {
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, createdAt: new Date("2026-08-31T23:59:59Z") });
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, createdAt: new Date("2026-09-01T00:00:00Z") });

    const rows = await repository.countDailyExecutions({ tenantId: 1 }, new Date("2026-09-01T00:00:00Z"));

    expect(rows).toEqual([{ day: "2026-09-01", total: 1, failed: 0 }]);
  });

  it("filters by project and tenant", async () => {
    const createdAt = new Date("2026-09-02T10:00:00Z");
    await insertLog({ tenantId: 1, projectId: 10, isSuccess: true, createdAt });
    await insertLog({ tenantId: 1, projectId: 20, isSuccess: true, createdAt });
    await insertLog({ tenantId: 2, projectId: 10, isSuccess: true, createdAt });

    const rows = await repository.countDailyExecutions({ tenantId: 1, projectId: 10 }, new Date("2026-09-01T00:00:00Z"));

    expect(rows).toEqual([{ day: "2026-09-02", total: 1, failed: 0 }]);
  });
});
