import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetRepository - findById", () => {
  let repository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new DataSetRepository(env.DB);
  });

  it("should return dataset by id for correct tenant and project", async () => {
    const created = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      isDeleted: false,
      countOfRecords: 10,
      schema: '{"field": "value"}',
    });

    const found = await repository.findById({
      tenantId: 1,
      projectId: 1,
      dataSetId: created.id,
    });

    expect(found).toBeDefined();
    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe("Test Dataset");
    expect(found?.countOfRecords).toBe(10);
    expect(found?.schema).toBe('{"field": "value"}');
  });

  it("should return undefined for non-existent dataset", async () => {
    const found = await repository.findById({
      tenantId: 1,
      projectId: 1,
      dataSetId: 99999,
    });

    expect(found).toBeUndefined();
  });

  it("should return undefined for deleted dataset", async () => {
    const created = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Deleted Dataset",
      slug: "deleted-dataset",
      isDeleted: true,
      countOfRecords: 0,
      schema: "{}",
    });

    const found = await repository.findById({
      tenantId: 1,
      projectId: 1,
      dataSetId: created.id,
    });

    expect(found).toBeUndefined();
  });

  it("should return undefined for wrong tenant (cross-tenant protection)", async () => {
    const created = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "T1 Dataset",
      slug: "t1-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const found = await repository.findById({
      tenantId: 2,
      projectId: 1,
      dataSetId: created.id,
    });

    expect(found).toBeUndefined();
  });

  it("should return undefined for wrong project (cross-project protection)", async () => {
    const created = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "P1 Dataset",
      slug: "p1-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const found = await repository.findById({
      tenantId: 1,
      projectId: 2,
      dataSetId: created.id,
    });

    expect(found).toBeUndefined();
  });
});
