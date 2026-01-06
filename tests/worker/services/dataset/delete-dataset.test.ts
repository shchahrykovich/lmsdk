import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/services/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { DataSet } from "../../../../worker/db/schema";

describe("DataSetService - deleteDataSet", () => {
  let datasetService: DataSetService;

  beforeEach(async () => {
    await applyMigrations();
    datasetService = new DataSetService(env.DB);
  });

  it("should soft delete a dataset", async () => {
    const context = { tenantId: 1, projectId: 1 };
    const dataset = await datasetService.createDataSet(context, {
      name: "To Delete",
    });

    await datasetService.deleteDataSet({
      ...context,
      dataSetId: dataset.id,
    });

    // Should not be found via service
    const found = await datasetService.getDataSetById({
      ...context,
      dataSetId: dataset.id,
    });

    expect(found).toBeUndefined();

    // But should still exist in database with isDeleted = true
    const dbResult = await env.DB.prepare(
      "SELECT * FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<DataSet>();

    expect(dbResult).toBeDefined();
    expect(dbResult?.isDeleted).toBe(1); // SQLite stores boolean as 0/1
  });

  it("should only delete dataset for correct tenant (cross-tenant protection)", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "T1 Dataset" }
    );

    // Try to delete with wrong tenant
    await datasetService.deleteDataSet({
      tenantId: 2,
      projectId: 1,
      dataSetId: dataset.id,
    });

    // Should still be accessible
    const found = await datasetService.getDataSetById({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    });

    expect(found).toBeDefined();
    expect(found?.isDeleted).toBe(false);
  });

  it("should only delete dataset for correct project (cross-project protection)", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "P1 Dataset" }
    );

    // Try to delete with wrong project
    await datasetService.deleteDataSet({
      tenantId: 1,
      projectId: 2,
      dataSetId: dataset.id,
    });

    // Should still be accessible
    const found = await datasetService.getDataSetById({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    });

    expect(found).toBeDefined();
    expect(found?.isDeleted).toBe(false);
  });
});
