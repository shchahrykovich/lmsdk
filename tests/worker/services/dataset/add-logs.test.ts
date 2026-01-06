import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { DataSetService } from "../../../../worker/services/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";
import { promptExecutionLogs } from "../../../../worker/db/schema";

describe("DataSetService - addLogsToDataSet", () => {
  let datasetService: DataSetService;
  let db: ReturnType<typeof drizzle>;

  const tenantId = 1;
  const projectId = 1;
  const promptId = 1;
  const version = 1;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    datasetService = new DataSetService(env.DB, env.PRIVATE_FILES);
  });

  const createLog = async (logPath: string) => {
    const [log] = await db.insert(promptExecutionLogs).values({
      tenantId,
      projectId,
      promptId,
      version,
      isSuccess: true,
      logPath,
    }).returning();
    return log.id;
  };

  it("should create records, update schema, and increment count", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId, projectId },
      { name: "Test Dataset" }
    );

    const logId1 = await createLog(`logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/101`);
    const logId2 = await createLog(`logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/102`);

    await env.PRIVATE_FILES.put(
      `logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/101/variables.json`,
      JSON.stringify({ user: { name: "Ada" }, count: 1 })
    );

    await env.PRIVATE_FILES.put(
      `logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/102/variables.json`,
      JSON.stringify({ user: { name: 2 }, active: true })
    );

    const result = await datasetService.addLogsToDataSet(
      { tenantId, projectId, dataSetId: dataset.id },
      { logIds: [logId1, logId2] }
    );

    expect(result).toEqual({ added: 2, skipped: 0 });

    const recordCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM DataSetRecords WHERE dataSetId = ?"
    )
      .bind(dataset.id)
      .first<{ count: number }>();

    expect(recordCount?.count).toBe(2);

    const datasetRow = await env.DB.prepare(
      "SELECT countOfRecords, schema FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ countOfRecords: number; schema: string }>();

    expect(datasetRow?.countOfRecords).toBe(2);

    const schema = JSON.parse(datasetRow?.schema ?? "{}") as {
      fields?: Record<string, { type: string }>;
    };
    expect(schema.fields?.["user.name"]?.type).toBe("mixed");
    expect(schema.fields?.count?.type).toBe("number");
    expect(schema.fields?.active?.type).toBe("boolean");
  });

  it("should skip logs with missing variables", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId, projectId },
      { name: "Empty Variables Dataset" }
    );

    const logId = await createLog(`logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/201`);

    const result = await datasetService.addLogsToDataSet(
      { tenantId, projectId, dataSetId: dataset.id },
      { logIds: [logId] }
    );

    expect(result).toEqual({ added: 0, skipped: 1 });

    const datasetRow = await env.DB.prepare(
      "SELECT countOfRecords FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ countOfRecords: number }>();

    expect(datasetRow?.countOfRecords).toBe(0);
  });
});
