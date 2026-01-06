import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRecordRepository } from "../../../../worker/repositories/dataset-record.repository";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetRecordRepository - softDeleteMany", () => {
  let recordRepository: DataSetRecordRepository;
  let datasetRepository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    recordRepository = new DataSetRecordRepository(env.DB);
    datasetRepository = new DataSetRepository(env.DB);
  });

  it("should soft delete multiple records", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const records = await recordRepository.createMany([
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

    const recordIds = [records[0].id, records[1].id];
    const deletedCount = await recordRepository.softDeleteMany(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
      },
      recordIds
    );

    expect(deletedCount).toBe(2);

    // Verify records are marked as deleted using direct SQL
    const result = await env.DB.prepare(
      "SELECT id, isDeleted FROM DataSetRecords WHERE dataSetId = ? ORDER BY id"
    )
      .bind(dataset.id)
      .all();

    expect(result.results).toHaveLength(3);
    expect(result.results[0].isDeleted).toBe(1); // SQLite uses 0/1 for booleans
    expect(result.results[1].isDeleted).toBe(1);
    expect(result.results[2].isDeleted).toBe(0);
  });

  it("should only delete records from specified dataset", async () => {
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

    const [record1] = await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset1.id,
        variables: JSON.stringify({ dataset: 1 }),
        isDeleted: false,
      },
    ]);

    const [record2] = await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset2.id,
        variables: JSON.stringify({ dataset: 2 }),
        isDeleted: false,
      },
    ]);

    // Try to delete record from dataset2 using dataset1 context
    const deletedCount = await recordRepository.softDeleteMany(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset1.id,
      },
      [record2.id]
    );

    expect(deletedCount).toBe(0);

    // Verify record2 is NOT deleted
    const result = await env.DB.prepare(
      "SELECT isDeleted FROM DataSetRecords WHERE id = ?"
    )
      .bind(record2.id)
      .first();

    expect(result?.isDeleted).toBe(0);
  });

  it("should enforce cross-tenant protection", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Tenant 1 Dataset",
      slug: "tenant-1-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const [record] = await recordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ tenant: 1 }),
        isDeleted: false,
      },
    ]);

    // Try to delete with different tenantId
    const deletedCount = await recordRepository.softDeleteMany(
      {
        tenantId: 2,
        projectId: 1,
        dataSetId: dataset.id,
      },
      [record.id]
    );

    expect(deletedCount).toBe(0);

    // Verify record is NOT deleted
    const result = await env.DB.prepare(
      "SELECT isDeleted FROM DataSetRecords WHERE id = ?"
    )
      .bind(record.id)
      .first();

    expect(result?.isDeleted).toBe(0);
  });

  it("should not delete already deleted records", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Delete Test Dataset",
      slug: "delete-test-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const records = await recordRepository.createMany([
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
        variables: JSON.stringify({ status: "already-deleted" }),
        isDeleted: true,
      },
    ]);

    const deletedCount = await recordRepository.softDeleteMany(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
      },
      [records[0].id, records[1].id]
    );

    expect(deletedCount).toBe(1); // Only the first record should be deleted
  });

  it("should return 0 when no record IDs provided", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Empty Delete Dataset",
      slug: "empty-delete-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const deletedCount = await recordRepository.softDeleteMany(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
      },
      []
    );

    expect(deletedCount).toBe(0);
  });

  it("should return 0 when no matching records found", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "No Match Dataset",
      slug: "no-match-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const deletedCount = await recordRepository.softDeleteMany(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
      },
      [999, 1000, 1001]
    );

    expect(deletedCount).toBe(0);
  });

  it("should handle partial matches correctly", async () => {
    const dataset = await datasetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Partial Match Dataset",
      slug: "partial-match-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const [record1, record2] = await recordRepository.createMany([
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
    ]);

    // Try to delete one valid and two invalid IDs
    const deletedCount = await recordRepository.softDeleteMany(
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
      },
      [record1.id, 999, 1000]
    );

    expect(deletedCount).toBe(1);

    // Verify only record1 is deleted
    const result = await env.DB.prepare(
      "SELECT id, isDeleted FROM DataSetRecords WHERE dataSetId = ? ORDER BY id"
    )
      .bind(dataset.id)
      .all();

    expect(result.results[0].isDeleted).toBe(1);
    expect(result.results[1].isDeleted).toBe(0);
  });
});
