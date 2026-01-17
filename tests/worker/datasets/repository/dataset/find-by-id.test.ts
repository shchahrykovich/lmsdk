import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRepository } from "../../../../../worker/datasets/dataset.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import {EntityId} from "../../../../../worker/shared/entity-id";
import {ProjectId} from "../../../../../worker/shared/project-id";

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

		const entityId = new EntityId(created.id, new ProjectId(1, 1, ''));
    const found = await repository.findById(entityId);

    expect(found).toBeDefined();
    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe("Test Dataset");
    expect(found?.countOfRecords).toBe(10);
    expect(found?.schema).toBe('{"field": "value"}');
  });

  it("should return undefined for non-existent dataset", async () => {
		const entityId = new EntityId(99999, new ProjectId(1, 1, ''));
    const found = await repository.findById(entityId);

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

		const entityId = new EntityId(created.id, new ProjectId(1, 1, ''));
    const found = await repository.findById(entityId);

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

		const entityId = new EntityId(created.id, new ProjectId(1, 2, ''));
    const found = await repository.findById(entityId);

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

		const entityId = new EntityId(created.id, new ProjectId(2, 1, ''));
    const found = await repository.findById(entityId);

    expect(found).toBeUndefined();
  });
});
