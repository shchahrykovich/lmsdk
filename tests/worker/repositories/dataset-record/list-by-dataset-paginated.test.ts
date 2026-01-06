import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRecordRepository } from "../../../../worker/repositories/dataset-record.repository";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetRecordRepository - listByDataSetPaginated", () => {
  let recordRepository: DataSetRecordRepository;
  let datasetRepository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    recordRepository = new DataSetRecordRepository(env.DB);
    datasetRepository = new DataSetRepository(env.DB);
  });

  it("should return paginated records with correct total count", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ index: 1 }),
        isDeleted: false,
      },
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ index: 2 }),
        isDeleted: false,
      },
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ index: 3 }),
        isDeleted: false,
      },
    ]);

    const result = await recordRepository.listByDataSetPaginated(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
      },
      { page: 1, pageSize: 2 }
    );

    expect(result.total).toBe(3);
    expect(result.records).toHaveLength(2);
  });

  it("should return correct page of records", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Pagination Dataset",
      slug: "pagination-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    // Create 5 records
    await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ index: 1 }),
        isDeleted: false,
      },
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ index: 2 }),
        isDeleted: false,
      },
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ index: 3 }),
        isDeleted: false,
      },
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ index: 4 }),
        isDeleted: false,
      },
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ index: 5 }),
        isDeleted: false,
      },
    ]);

    // Get page 2 with 2 records per page (records are ordered by createdAt desc)
    const result = await recordRepository.listByDataSetPaginated(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
      },
      { page: 2, pageSize: 2 }
    );

    expect(result.records).toHaveLength(2);
    expect(result.total).toBe(5);
  });

  it("should only return records from specified dataset", async () => {
    const dataset1 = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Dataset 1",
      slug: "dataset-1",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const dataset2 = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Dataset 2",
      slug: "dataset-2",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset1.id,
        variables: JSON.stringify({ dataset: 1 }),
        isDeleted: false,
      },
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset2.id,
        variables: JSON.stringify({ dataset: 2 }),
        isDeleted: false,
      },
    ]);

    const result = await recordRepository.listByDataSetPaginated(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset1.id,
      },
      { page: 1, pageSize: 10 }
    );

    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(JSON.parse(result.records[0]!.variables)).toEqual({ dataset: 1 });
  });

  it("should scope records by tenantId", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Tenant Dataset",
      slug: "tenant-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ tenant: 1 }),
        isDeleted: false,
      },
    ]);

    const result = await recordRepository.listByDataSetPaginated(
      {
        tenantId: 2,
        projectId: 1,
        dataSetId: dataset.id,
      },
      { page: 1, pageSize: 10 }
    );

    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("should exclude deleted records", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Delete Test Dataset",
      slug: "delete-test-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ status: "active" }),
        isDeleted: false,
      },
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ status: "deleted" }),
        isDeleted: true,
      },
    ]);

    const result = await recordRepository.listByDataSetPaginated(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
      },
      { page: 1, pageSize: 10 }
    );

    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(JSON.parse(result.records[0]!.variables)).toEqual({ status: "active" });
  });

  it("should return empty results when no records match", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Empty Dataset",
      slug: "empty-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const result = await recordRepository.listByDataSetPaginated(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
      },
      { page: 1, pageSize: 10 }
    );

    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("should handle page beyond available records", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ index: 1 }),
        isDeleted: false,
      },
    ]);

    const result = await recordRepository.listByDataSetPaginated(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
      },
      { page: 5, pageSize: 10 }
    );

    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(1);
  });
});
