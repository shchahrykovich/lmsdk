import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";
import type { DataSet } from "../../../../worker/db/schema";

describe("DataSetRepository - findByTenantAndProject", () => {
  let repository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new DataSetRepository(env.DB);
  });

  it("should return all non-deleted datasets for tenant and project", async () => {
    const dataset1 = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Dataset 1",
      slug: "dataset-1",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const dataset2 = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Dataset 2",
      slug: "dataset-2",
      isDeleted: false,
      countOfRecords: 5,
      schema: "{}",
    });

    const datasets = await repository.findByTenantAndProject({
      tenantId: 1,
      projectId: 1,
    });

    expect(datasets).toHaveLength(2);
    expect(datasets.map((d) => d.id)).toContain(dataset1.id);
    expect(datasets.map((d) => d.id)).toContain(dataset2.id);
  });

  it("should exclude deleted datasets", async () => {
    const activeDataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Active Dataset",
      slug: "active-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const deletedDataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Deleted Dataset",
      slug: "deleted-dataset",
      isDeleted: true,
      countOfRecords: 0,
      schema: "{}",
    });

    const datasets = await repository.findByTenantAndProject({
      tenantId: 1,
      projectId: 1,
    });

    expect(datasets).toHaveLength(1);
    expect(datasets[0].id).toBe(activeDataset.id);

    // Verify using direct SQL that both datasets exist
    const allDatasets = await env.DB.prepare(
      "SELECT * FROM DataSets WHERE tenantId = ? AND projectId = ?"
    )
      .bind(1, 1)
      .all<DataSet>();

    expect(allDatasets.results).toHaveLength(2);
  });

  it("should only return datasets for the specified tenant (cross-tenant protection)", async () => {
    await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "T1 Dataset",
      slug: "t1-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    await repository.create({
      tenantId: 2,
      projectId: 1,
      name: "T2 Dataset",
      slug: "t2-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const tenant1Datasets = await repository.findByTenantAndProject({
      tenantId: 1,
      projectId: 1,
    });

    const tenant2Datasets = await repository.findByTenantAndProject({
      tenantId: 2,
      projectId: 1,
    });

    expect(tenant1Datasets).toHaveLength(1);
    expect(tenant2Datasets).toHaveLength(1);
    expect(tenant1Datasets[0].tenantId).toBe(1);
    expect(tenant2Datasets[0].tenantId).toBe(2);

    // Verify using direct SQL that both datasets exist
    const allDatasets = await env.DB.prepare("SELECT * FROM DataSets")
      .all<DataSet>();

    expect(allDatasets.results).toHaveLength(2);
  });

  it("should only return datasets for the specified project (cross-project protection)", async () => {
    await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "P1 Dataset",
      slug: "p1-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    await repository.create({
      tenantId: 1,
      projectId: 2,
      name: "P2 Dataset",
      slug: "p2-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const project1Datasets = await repository.findByTenantAndProject({
      tenantId: 1,
      projectId: 1,
    });

    const project2Datasets = await repository.findByTenantAndProject({
      tenantId: 1,
      projectId: 2,
    });

    expect(project1Datasets).toHaveLength(1);
    expect(project2Datasets).toHaveLength(1);
    expect(project1Datasets[0].projectId).toBe(1);
    expect(project2Datasets[0].projectId).toBe(2);
  });

  it("should return empty array when no datasets exist", async () => {
    const datasets = await repository.findByTenantAndProject({
      tenantId: 1,
      projectId: 1,
    });

    expect(datasets).toEqual([]);
  });
});
