import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/services/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetService - deleteDataSetRecords", () => {
  let datasetService: DataSetService;

  beforeEach(async () => {
    await applyMigrations();
    datasetService = new DataSetService(env.DB);
  });

  it("should delete multiple records and update count", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Test Dataset" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    // Create 3 records
    const record1 = await datasetService.createDataSetRecord(context, { index: 1 });
    const record2 = await datasetService.createDataSetRecord(context, { index: 2 });
    const record3 = await datasetService.createDataSetRecord(context, { index: 3 });

    // Verify count is 3
    let updatedDataset = await datasetService.getDataSetById(context);
    expect(updatedDataset?.countOfRecords).toBe(3);

    // Delete 2 records
    const result = await datasetService.deleteDataSetRecords(
      context,
      [record1.id, record2.id]
    );

    expect(result.deleted).toBe(2);

    // Verify count is updated to 1
    updatedDataset = await datasetService.getDataSetById(context);
    expect(updatedDataset?.countOfRecords).toBe(1);
  });

  it("should return 0 when no records deleted", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Empty Dataset" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const result = await datasetService.deleteDataSetRecords(
      context,
      [999, 1000]
    );

    expect(result.deleted).toBe(0);

    // Verify count remains 0
    const updatedDataset = await datasetService.getDataSetById(context);
    expect(updatedDataset?.countOfRecords).toBe(0);
  });

  it("should enforce cross-tenant protection", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Tenant 1 Dataset" }
    );

    const context1 = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const record = await datasetService.createDataSetRecord(context1, { data: "test" });

    // Try to delete with different tenant
    const context2 = {
      tenantId: 2,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const result = await datasetService.deleteDataSetRecords(
      context2,
      [record.id]
    );

    expect(result.deleted).toBe(0);

    // Verify count is still 1 for tenant 1
    const updatedDataset = await datasetService.getDataSetById(context1);
    expect(updatedDataset?.countOfRecords).toBe(1);
  });

  it("should handle empty record IDs array", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Test Dataset" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    await datasetService.createDataSetRecord(context, { data: "test" });

    const result = await datasetService.deleteDataSetRecords(context, []);

    expect(result.deleted).toBe(0);

    const updatedDataset = await datasetService.getDataSetById(context);
    expect(updatedDataset?.countOfRecords).toBe(1);
  });

  it("should not delete already deleted records", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Delete Test Dataset" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const record1 = await datasetService.createDataSetRecord(context, { status: "active" });
    const record2 = await datasetService.createDataSetRecord(context, { status: "to-delete" });

    // Delete record2 first time
    const result1 = await datasetService.deleteDataSetRecords(context, [record2.id]);
    expect(result1.deleted).toBe(1);

    let updatedDataset = await datasetService.getDataSetById(context);
    expect(updatedDataset?.countOfRecords).toBe(1);

    // Try to delete record2 again
    const result2 = await datasetService.deleteDataSetRecords(context, [record2.id]);
    expect(result2.deleted).toBe(0);

    // Count should still be 1
    updatedDataset = await datasetService.getDataSetById(context);
    expect(updatedDataset?.countOfRecords).toBe(1);
  });

  it("should handle partial successful deletions", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Partial Delete Dataset" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const record1 = await datasetService.createDataSetRecord(context, { index: 1 });
    await datasetService.createDataSetRecord(context, { index: 2 });

    // Try to delete one valid and one invalid ID
    const result = await datasetService.deleteDataSetRecords(
      context,
      [record1.id, 999]
    );

    expect(result.deleted).toBe(1);

    const updatedDataset = await datasetService.getDataSetById(context);
    expect(updatedDataset?.countOfRecords).toBe(1);
  });

  it("should delete all records when all IDs provided", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Delete All Dataset" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const record1 = await datasetService.createDataSetRecord(context, { index: 1 });
    const record2 = await datasetService.createDataSetRecord(context, { index: 2 });
    const record3 = await datasetService.createDataSetRecord(context, { index: 3 });

    const result = await datasetService.deleteDataSetRecords(
      context,
      [record1.id, record2.id, record3.id]
    );

    expect(result.deleted).toBe(3);

    const updatedDataset = await datasetService.getDataSetById(context);
    expect(updatedDataset?.countOfRecords).toBe(0);
  });
});
