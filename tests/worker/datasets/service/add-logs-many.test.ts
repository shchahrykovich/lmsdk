import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { DataSetService } from "../../../../worker/datasets/dataset.service";
import { promptExecutionLogs } from "../../../../worker/db/schema";
import { EntityId } from "../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetService - addLogsToDataSet with many logs", () => {
  beforeEach(async () => {
    await applyMigrations();
  });

  it("adds 25 logs, above the D1 limit of 100 bound values per statement", async () => {
    const db = drizzle(env.DB);
    const service = new DataSetService(env.DB, env.PRIVATE_FILES);
    const project = new ProjectId(1, 1, "test-user");
    const dataset = await service.createDataSet({ tenantId: 1, projectId: 1 }, { name: "From logs" });
    const logIds: number[] = [];
    for (let i = 0; i < 25; i++) {
      const logPath = `logs/1/2025-01-01/1/1/1/${1000 + i}`;
      const [log] = await db
        .insert(promptExecutionLogs)
        .values({ tenantId: 1, projectId: 1, promptId: 1, version: 1, isSuccess: true, logPath })
        .returning();
      await env.PRIVATE_FILES.put(`${logPath}/variables.json`, JSON.stringify({ ticket: `t${i}` }));
      logIds.push(log.id);
    }

    const result = await service.addLogsToDataSet(new EntityId(dataset.id, project), { logIds });

    const row = await env.DB.prepare("SELECT countOfRecords FROM DataSets WHERE id = ?")
      .bind(dataset.id)
      .first<{ countOfRecords: number }>();
    expect(result).toEqual({ added: 25, skipped: 0 });
    expect(row?.countOfRecords).toBe(25);
  });
});
