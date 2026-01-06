import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRecordRepository } from "../../../../worker/repositories/dataset-record.repository";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetRecordRepository - createMany", () => {
  let recordRepository: DataSetRecordRepository;
  let datasetRepository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    recordRepository = new DataSetRecordRepository(env.DB);
    datasetRepository = new DataSetRepository(env.DB);
  });

  it("should insert multiple records", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Records Dataset",
      slug: "records-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const records = await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ a: 1 }),
        isDeleted: false,
      },
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ b: "two" }),
        isDeleted: false,
      },
    ]);

    expect(records).toHaveLength(2);

    const result = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM DataSetRecords WHERE dataSetId = ?"
    )
      .bind(dataset.id)
      .first<{ count: number }>();

    expect(result?.count).toBe(2);
  });

  it("should return empty array for no records", async () => {
    const records = await recordRepository.createMany([]);
    expect(records).toEqual([]);
  });
});
