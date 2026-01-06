import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRecordRepository } from "../../../../worker/repositories/dataset-record.repository";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetRecordRepository - listBatchByProject", () => {
  let recordRepository: DataSetRecordRepository;
  let datasetRepository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    recordRepository = new DataSetRecordRepository(env.DB);
    datasetRepository = new DataSetRepository(env.DB);
  });

  it("should return ordered batches by id", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Batch Dataset",
      slug: "batch-dataset",
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

    const firstBatch = await recordRepository.listBatchByProject({
      tenantId: 1,
      projectId: 1,
      limit: 2,
    });

    expect(firstBatch).toHaveLength(2);
    expect(firstBatch[0]?.id).toBe(first.id);
    expect(firstBatch[1]?.id).toBe(second.id);

    const nextBatch = await recordRepository.listBatchByProject({
      tenantId: 1,
      projectId: 1,
      limit: 2,
      afterId: second.id,
    });

    expect(nextBatch).toHaveLength(1);
    expect(nextBatch[0]?.id).toBe(third.id);
  });

  it("should scope records by project", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 2,
      name: "Other Dataset",
      slug: "other-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 2,
        dataSetId: dataset.id,
        variables: JSON.stringify({ index: 1 }),
        isDeleted: false,
      },
    ]);

    const records = await recordRepository.listBatchByProject({
      tenantId: 1,
      projectId: 1,
      limit: 10,
    });

    expect(records).toHaveLength(0);
  });
});
