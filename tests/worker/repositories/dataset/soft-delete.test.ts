import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";
import type { DataSet } from "../../../../worker/db/schema";

describe("DataSetRepository - softDelete", () => {
  let repository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new DataSetRepository(env.DB);
  });

  it("should soft delete a dataset", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Dataset to Delete",
      slug: "dataset-to-delete",
      isDeleted: false,
      countOfRecords: 5,
      schema: "{}",
    });

    await repository.softDelete({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    });

    // Dataset should not be found by normal query
    const found = await repository.findById({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    });

    expect(found).toBeUndefined();

    // But it should still exist in database with isDeleted = true
    const result = await env.DB.prepare(
      "SELECT * FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<DataSet>();

    expect(result).toBeDefined();
    expect(result?.isDeleted).toBe(1); // SQLite stores boolean as 0/1
  });

  it("should only delete dataset for correct tenant (cross-tenant protection)", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "T1 Dataset",
      slug: "t1-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    // Try to delete with wrong tenant ID
    await repository.softDelete({
      tenantId: 2,
      projectId: 1,
      dataSetId: dataset.id,
    });

    // Dataset should still be active
    const found = await repository.findById({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    });

    expect(found).toBeDefined();
    expect(found?.isDeleted).toBe(false);
  });

  it("should only delete dataset for correct project (cross-project protection)", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "P1 Dataset",
      slug: "p1-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    // Try to delete with wrong project ID
    await repository.softDelete({
      tenantId: 1,
      projectId: 2,
      dataSetId: dataset.id,
    });

    // Dataset should still be active
    const found = await repository.findById({
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    });

    expect(found).toBeDefined();
    expect(found?.isDeleted).toBe(false);
  });
});
