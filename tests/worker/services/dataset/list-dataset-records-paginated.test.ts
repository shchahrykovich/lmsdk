import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/services/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetService - listDataSetRecordsPaginated", () => {
  let datasetService: DataSetService;

  beforeEach(async () => {
    await applyMigrations();
    datasetService = new DataSetService(env.DB);
  });

  it("should return paginated records with metadata", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Test Dataset" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    // Create 5 records
    for (let i = 1; i <= 5; i++) {
      await datasetService.createDataSetRecord(context, { index: i });
    }

    const result = await datasetService.listDataSetRecordsPaginated(
      context,
      { page: 1, pageSize: 2 }
    );

    expect(result.records).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.totalPages).toBe(3);
  });

  it("should calculate total pages correctly", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Pages Test" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    // Create 10 records
    for (let i = 1; i <= 10; i++) {
      await datasetService.createDataSetRecord(context, { index: i });
    }

    const result = await datasetService.listDataSetRecordsPaginated(
      context,
      { page: 1, pageSize: 3 }
    );

    expect(result.totalPages).toBe(4); // 10 records / 3 per page = 4 pages
  });

  it("should return correct page of records", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Page Test" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    // Create 5 records
    for (let i = 1; i <= 5; i++) {
      await datasetService.createDataSetRecord(context, { index: i });
    }

    const page2 = await datasetService.listDataSetRecordsPaginated(
      context,
      { page: 2, pageSize: 2 }
    );

    expect(page2.records).toHaveLength(2);
    expect(page2.page).toBe(2);
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

    await datasetService.createDataSetRecord(context1, { data: "tenant1" });

    // Try to list records with different tenant
    const context2 = {
      tenantId: 2,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const result = await datasetService.listDataSetRecordsPaginated(
      context2,
      { page: 1, pageSize: 10 }
    );

    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("should return empty results for non-existent dataset", async () => {
    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: 999999,
    };

    const result = await datasetService.listDataSetRecordsPaginated(
      context,
      { page: 1, pageSize: 10 }
    );

    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it("should handle empty dataset", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Empty Dataset" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const result = await datasetService.listDataSetRecordsPaginated(
      context,
      { page: 1, pageSize: 10 }
    );

    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.totalPages).toBe(0);
  });

  it("should handle page beyond available records", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Beyond Test" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    await datasetService.createDataSetRecord(context, { data: "test" });

    const result = await datasetService.listDataSetRecordsPaginated(
      context,
      { page: 10, pageSize: 10 }
    );

    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it("should exclude deleted records", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Delete Test" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    await datasetService.createDataSetRecord(context, { status: "active" });

    // Mark record as deleted using direct SQL
    await env.DB.prepare(
      "UPDATE DataSetRecords SET isDeleted = 1 WHERE dataSetId = ?"
    )
      .bind(dataset.id)
      .run();

    const result = await datasetService.listDataSetRecordsPaginated(
      context,
      { page: 1, pageSize: 10 }
    );

    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
