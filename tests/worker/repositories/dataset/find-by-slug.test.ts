import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetRepository - findBySlug", () => {
  let repository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new DataSetRepository(env.DB);
  });

  it("should return dataset by slug for correct tenant and project", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const found = await repository.findBySlug({
      tenantId: 1,
      projectId: 1,
      slug: "test-dataset",
    });

    expect(found?.id).toBe(dataset.id);
  });

  it("should return undefined for wrong tenant", async () => {
    await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const found = await repository.findBySlug({
      tenantId: 2,
      projectId: 1,
      slug: "test-dataset",
    });

    expect(found).toBeUndefined();
  });

  it("should return undefined for deleted dataset", async () => {
    await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Deleted Dataset",
      slug: "deleted-dataset",
      isDeleted: true,
      countOfRecords: 0,
      schema: "{}",
    });

    const found = await repository.findBySlug({
      tenantId: 1,
      projectId: 1,
      slug: "deleted-dataset",
    });

    expect(found).toBeUndefined();
  });
});
