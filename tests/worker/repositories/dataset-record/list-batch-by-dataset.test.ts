import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRecordRepository } from "../../../../worker/repositories/dataset-record.repository";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetRecordRepository - listBatchByDataSet", () => {
  let recordRepository: DataSetRecordRepository;
  let datasetRepository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    recordRepository = new DataSetRecordRepository(env.DB);
    datasetRepository = new DataSetRepository(env.DB);
  });

  it("should return ordered batches by id for specific dataset", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const [first, second, third] = await recordRepository.createMany([
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

    const firstBatch = await recordRepository.listBatchByDataSet({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
      limit: 2,
    });

    expect(firstBatch).toHaveLength(2);
    expect(firstBatch[0]?.id).toBe(first.id);
    expect(firstBatch[1]?.id).toBe(second.id);

    const nextBatch = await recordRepository.listBatchByDataSet({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
      limit: 2,
      afterId: second.id,
    });

    expect(nextBatch).toHaveLength(1);
    expect(nextBatch[0]?.id).toBe(third.id);
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

    const records = await recordRepository.listBatchByDataSet({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset1.id,
      limit: 10,
    });

    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0]!.variables)).toEqual({ dataset: 1 });
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

    const records = await recordRepository.listBatchByDataSet({
      tenantId: 2,
      projectId: 1,
      dataSetId: dataset.id,
      limit: 10,
    });

    expect(records).toHaveLength(0);
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

    const records = await recordRepository.listBatchByDataSet({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
      limit: 10,
    });

    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0]!.variables)).toEqual({ status: "active" });
  });

  it("should return empty array when no records match", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Empty Dataset",
      slug: "empty-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const records = await recordRepository.listBatchByDataSet({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
      limit: 10,
    });

    expect(records).toHaveLength(0);
  });
});
