import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRepository } from "../../../../../worker/datasets/dataset.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import type { DataSet } from "../../../../../worker/db/schema";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { EntityId } from "../../../../../worker/shared/entity-id";

describe("DataSetRepository - record count updates", () => {
  let repository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new DataSetRepository(env.DB);
  });

  it("should increment record count", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, ""));
    await repository.incrementRecordCount(entityId);

    // Verify using direct SQL
    const result = await env.DB.prepare(
      "SELECT countOfRecords FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ countOfRecords: number }>();

    expect(result?.countOfRecords).toBe(1);
  });

  it("should increment multiple times", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset-2",
      isDeleted: false,
      countOfRecords: 5,
      schema: "{}",
    });

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, ""));
    await repository.incrementRecordCount(entityId);
    await repository.incrementRecordCount(entityId);

    // Verify using direct SQL
    const result = await env.DB.prepare(
      "SELECT countOfRecords FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ countOfRecords: number }>();

    expect(result?.countOfRecords).toBe(7);
  });

  it("should decrement record count", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset-3",
      isDeleted: false,
      countOfRecords: 10,
      schema: "{}",
    });

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, ""));
    await repository.decrementRecordCount(entityId);

    // Verify using direct SQL
    const result = await env.DB.prepare(
      "SELECT countOfRecords FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ countOfRecords: number }>();

    expect(result?.countOfRecords).toBe(9);
  });

  it("should increment record count by amount", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Batch Dataset",
      slug: "batch-dataset",
      isDeleted: false,
      countOfRecords: 2,
      schema: "{}",
    });

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, ""));
    await repository.incrementRecordCountBy(entityId, 3);

    const result = await env.DB.prepare(
      "SELECT countOfRecords FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ countOfRecords: number }>();

    expect(result?.countOfRecords).toBe(5);
  });

  it("should ignore non-positive increment amounts", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "No Increment Dataset",
      slug: "no-increment-dataset",
      isDeleted: false,
      countOfRecords: 4,
      schema: "{}",
    });

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, ""));
    await repository.incrementRecordCountBy(entityId, 0);

    const result = await env.DB.prepare(
      "SELECT countOfRecords FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ countOfRecords: number }>();

    expect(result?.countOfRecords).toBe(4);
  });

  it("should only increment for correct tenant (cross-tenant protection)", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "T1 Dataset",
      slug: "t1-dataset",
      isDeleted: false,
      countOfRecords: 5,
      schema: "{}",
    });

    // Try to increment with wrong tenant ID
    const entityId = new EntityId(dataset.id, new ProjectId(1, 2, ""));
    await repository.incrementRecordCount(entityId);

    // Count should remain unchanged
    const result = await env.DB.prepare(
      "SELECT countOfRecords FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ countOfRecords: number }>();

    expect(result?.countOfRecords).toBe(5);
  });

  it("should only increment for correct project (cross-project protection)", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "P1 Dataset",
      slug: "p1-dataset",
      isDeleted: false,
      countOfRecords: 5,
      schema: "{}",
    });

    // Try to increment with wrong project ID
    const entityId = new EntityId(dataset.id, new ProjectId(2, 1, ""));
    await repository.incrementRecordCount(entityId);

    // Count should remain unchanged
    const result = await env.DB.prepare(
      "SELECT countOfRecords FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ countOfRecords: number }>();

    expect(result?.countOfRecords).toBe(5);
  });

  it("should update updatedAt timestamp on increment", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Test Dataset",
      slug: "test-dataset-4",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const originalUpdatedAt = dataset.updatedAt;

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, ""));
    await repository.incrementRecordCount(entityId);

    // Verify updatedAt changed using direct SQL
    const result = await env.DB.prepare(
      "SELECT updatedAt FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<DataSet>();

    expect(result?.updatedAt).toBeGreaterThan(Math.floor(originalUpdatedAt.getTime() / 1000));
  });
});
