import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/datasets/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";
import {ProjectId} from "../../../../worker/shared/project-id";
import {EntityId} from "../../../../worker/shared/entity-id";

describe("DataSetService - deleteDataSetRecords", () => {
  let datasetService: DataSetService;

  beforeEach(async () => {
    await applyMigrations();
    datasetService = new DataSetService(env.DB);
  });

  it("should delete multiple records and update count", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Test Dataset" }
    );

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

    const record1 = await datasetService.createDataSetRecord(entityId, { index: 1 });
    const record2 = await datasetService.createDataSetRecord(entityId, { index: 2 });
    const record3 = await datasetService.createDataSetRecord(entityId, { index: 3 });

    let updatedDataset = await datasetService.getDataSetById(entityId);
    expect(updatedDataset?.countOfRecords).toBe(3);

    const result = await datasetService.deleteDataSetRecords(
      entityId,
      [record1.id, record2.id]
    );

    expect(result.deleted).toBe(2);

    updatedDataset = await datasetService.getDataSetById(entityId);
    expect(updatedDataset?.countOfRecords).toBe(1);
  });

  it("should return 0 when no records deleted", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Empty Dataset" }
    );

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

    const result = await datasetService.deleteDataSetRecords(
      entityId,
      [999, 1000]
    );

    expect(result.deleted).toBe(0);

    const updatedDataset = await datasetService.getDataSetById(entityId);
    expect(updatedDataset?.countOfRecords).toBe(0);
  });

  it("should enforce cross-tenant protection", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Tenant 1 Dataset" }
    );

    const entityId1 = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));
    const record = await datasetService.createDataSetRecord(entityId1, { data: "test" });

    const entityId2 = new EntityId(dataset.id, new ProjectId(1, 2, 'test-user'));
    const result = await datasetService.deleteDataSetRecords(
      entityId2,
      [record.id]
    );

    expect(result.deleted).toBe(0);

    const updatedDataset = await datasetService.getDataSetById(entityId1);
    expect(updatedDataset?.countOfRecords).toBe(1);
  });

  it("should handle empty record IDs array", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Test Dataset" }
    );

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

    await datasetService.createDataSetRecord(entityId, { data: "test" });

    const result = await datasetService.deleteDataSetRecords(entityId, []);

    expect(result.deleted).toBe(0);

    const updatedDataset = await datasetService.getDataSetById(entityId);
    expect(updatedDataset?.countOfRecords).toBe(1);
  });

  it("should not delete already deleted records", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Delete Test Dataset" }
    );

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

    const record1 = await datasetService.createDataSetRecord(entityId, { status: "active" });
    const record2 = await datasetService.createDataSetRecord(entityId, { status: "to-delete" });

    const result1 = await datasetService.deleteDataSetRecords(entityId, [record2.id]);
    expect(result1.deleted).toBe(1);

    let updatedDataset = await datasetService.getDataSetById(entityId);
    expect(updatedDataset?.countOfRecords).toBe(1);

    const result2 = await datasetService.deleteDataSetRecords(entityId, [record2.id]);
    expect(result2.deleted).toBe(0);

    updatedDataset = await datasetService.getDataSetById(entityId);
    expect(updatedDataset?.countOfRecords).toBe(1);
  });

  it("should handle partial successful deletions", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Partial Delete Dataset" }
    );

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

    const record1 = await datasetService.createDataSetRecord(entityId, { index: 1 });
    await datasetService.createDataSetRecord(entityId, { index: 2 });

    const result = await datasetService.deleteDataSetRecords(
      entityId,
      [record1.id, 999]
    );

    expect(result.deleted).toBe(1);

    const updatedDataset = await datasetService.getDataSetById(entityId);
    expect(updatedDataset?.countOfRecords).toBe(1);
  });

  it("should delete all records when all IDs provided", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Delete All Dataset" }
    );

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

    const record1 = await datasetService.createDataSetRecord(entityId, { index: 1 });
    const record2 = await datasetService.createDataSetRecord(entityId, { index: 2 });
    const record3 = await datasetService.createDataSetRecord(entityId, { index: 3 });

    const result = await datasetService.deleteDataSetRecords(
      entityId,
      [record1.id, record2.id, record3.id]
    );

    expect(result.deleted).toBe(3);

    const updatedDataset = await datasetService.getDataSetById(entityId);
    expect(updatedDataset?.countOfRecords).toBe(0);
  });
});
