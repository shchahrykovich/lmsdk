import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRecordRepository } from "../../../../worker/repositories/dataset-record.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetRecordRepository.findById", () => {
  let repository: DataSetRecordRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new DataSetRecordRepository(env.DB);
  });

  it("should return record by id", async () => {
    // Create test data
    await env.DB
      .prepare(
        `INSERT INTO DataSets (id, tenantId, projectId, name, slug, isDeleted)
         VALUES (1, 1, 1, 'Test Dataset', 'test-dataset', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (1, 1, 1, 1, '{"key":"value"}', 0)`
      )
      .run();

    const record = await repository.findById({
      tenantId: 1,
      projectId: 1,
      recordId: 1,
    });

    expect(record).toBeDefined();
    expect(record).toMatchObject({
      id: 1,
      tenantId: 1,
      projectId: 1,
      dataSetId: 1,
      variables: '{"key":"value"}',
      isDeleted: false,
    });
  });

  it("should return undefined when record does not exist", async () => {
    const record = await repository.findById({
      tenantId: 1,
      projectId: 1,
      recordId: 999,
    });

    expect(record).toBeUndefined();
  });

  it("should filter by tenantId to prevent cross-tenant access", async () => {
    // Create records for different tenants
    await env.DB
      .prepare(
        `INSERT INTO DataSets (id, tenantId, projectId, name, slug, isDeleted)
         VALUES (1, 1, 1, 'Dataset 1', 'dataset-1', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSets (id, tenantId, projectId, name, slug, isDeleted)
         VALUES (2, 2, 1, 'Dataset 2', 'dataset-2', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (1, 1, 1, 1, '{"tenant":"1"}', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (2, 2, 1, 2, '{"tenant":"2"}', 0)`
      )
      .run();

    // Tenant 1 should not see tenant 2's record
    const record = await repository.findById({
      tenantId: 1,
      projectId: 1,
      recordId: 2,
    });

    expect(record).toBeUndefined();
  });

  it("should filter by projectId to prevent cross-project access", async () => {
    // Create records for different projects
    await env.DB
      .prepare(
        `INSERT INTO DataSets (id, tenantId, projectId, name, slug, isDeleted)
         VALUES (1, 1, 1, 'Dataset 1', 'dataset-1', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSets (id, tenantId, projectId, name, slug, isDeleted)
         VALUES (2, 1, 2, 'Dataset 2', 'dataset-2', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (1, 1, 1, 1, '{"project":"1"}', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (2, 1, 2, 2, '{"project":"2"}', 0)`
      )
      .run();

    // Project 1 should not see project 2's record
    const record = await repository.findById({
      tenantId: 1,
      projectId: 1,
      recordId: 2,
    });

    expect(record).toBeUndefined();
  });

  it("should not return deleted records", async () => {
    await env.DB
      .prepare(
        `INSERT INTO DataSets (id, tenantId, projectId, name, slug, isDeleted)
         VALUES (1, 1, 1, 'Test Dataset', 'test-dataset', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (1, 1, 1, 1, '{"key":"value"}', 1)`
      )
      .run();

    const record = await repository.findById({
      tenantId: 1,
      projectId: 1,
      recordId: 1,
    });

    expect(record).toBeUndefined();
  });

  it("should return record with all fields correctly typed", async () => {
    await env.DB
      .prepare(
        `INSERT INTO DataSets (id, tenantId, projectId, name, slug, isDeleted)
         VALUES (1, 1, 1, 'Test Dataset', 'test-dataset', 0)`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted)
         VALUES (1, 1, 1, 1, '{"key":"value","nested":{"data":"test"}}', 0)`
      )
      .run();

    const record = await repository.findById({
      tenantId: 1,
      projectId: 1,
      recordId: 1,
    });

    expect(record).toBeDefined();
    expect(record!.id).toBe(1);
    expect(record!.tenantId).toBe(1);
    expect(record!.projectId).toBe(1);
    expect(record!.dataSetId).toBe(1);
    expect(record!.variables).toBe('{"key":"value","nested":{"data":"test"}}');
    expect(record!.isDeleted).toBe(false);
    expect(record!.createdAt).toBeInstanceOf(Date);
    expect(record!.updatedAt).toBeInstanceOf(Date);
  });
});
