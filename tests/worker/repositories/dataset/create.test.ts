import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";
import type { DataSet } from "../../../../worker/db/schema";

describe("DataSetRepository - create", () => {
  let repository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new DataSetRepository(env.DB);
  });

  it("should create a new dataset with all fields", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: '{"field": "string"}',
    });

    expect(dataset.id).toBeDefined();
    expect(dataset.tenantId).toBe(1);
    expect(dataset.projectId).toBe(1);
    expect(dataset.name).toBe("Test Dataset");
    expect(dataset.slug).toBe("test-dataset");
    expect(dataset.isDeleted).toBe(false);
    expect(dataset.countOfRecords).toBe(0);
    expect(dataset.schema).toBe('{"field": "string"}');
    expect(dataset.createdAt).toBeDefined();
    expect(dataset.updatedAt).toBeDefined();

    // Verify using direct SQL
    const result = await env.DB.prepare(
      "SELECT * FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<DataSet>();

    expect(result).toBeDefined();
    expect(result?.name).toBe("Test Dataset");
  });

  it("should create dataset with default schema", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Simple Dataset",
      slug: "simple-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    expect(dataset.schema).toBe("{}");
  });

  it("should create datasets for different tenants", async () => {
    const dataset1 = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "T1 Dataset",
      slug: "t1-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const dataset2 = await repository.create({
      tenantId: 2,
      projectId: 1,
      name: "T2 Dataset",
      slug: "t2-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    expect(dataset1.tenantId).toBe(1);
    expect(dataset2.tenantId).toBe(2);

    // Verify both exist in database
    const allDatasets = await env.DB.prepare("SELECT * FROM DataSets")
      .all<DataSet>();

    expect(allDatasets.results).toHaveLength(2);
  });

  it("should create datasets for different projects", async () => {
    const dataset1 = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "P1 Dataset",
      slug: "p1-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const dataset2 = await repository.create({
      tenantId: 1,
      projectId: 2,
      name: "P2 Dataset",
      slug: "p2-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    expect(dataset1.projectId).toBe(1);
    expect(dataset2.projectId).toBe(2);
  });
});
