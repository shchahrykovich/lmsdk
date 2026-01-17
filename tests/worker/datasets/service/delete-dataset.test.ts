import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/datasets/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { DataSet } from "../../../../worker/db/schema";
import {EntityId} from "../../../../worker/shared/entity-id";
import {ProjectId} from "../../../../worker/shared/project-id";

describe("DataSetService - deleteDataSet", () => {
  let datasetService: DataSetService;

  beforeEach(async () => {
    await applyMigrations();
    datasetService = new DataSetService(env.DB);
  });

  it("should soft delete a dataset", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "To Delete" }
    );

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));
    await datasetService.deleteDataSet(entityId);

    const found = await datasetService.getDataSetById(entityId);

    expect(found).toBeUndefined();

    // But should still exist in database with isDeleted = true
    const dbResult = await env.DB.prepare(
      "SELECT * FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<DataSet>();

    expect(dbResult).toBeDefined();
    expect(dbResult?.isDeleted).toBe(1); // SQLite stores boolean as 0/1
  });

  it("should only delete dataset for correct tenant (cross-tenant protection)", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "T1 Dataset" }
    );

    const wrongEntityId = new EntityId(dataset.id, new ProjectId(1, 2, 'test-user'));
    await datasetService.deleteDataSet(wrongEntityId);

    const correctEntityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));
    const found = await datasetService.getDataSetById(correctEntityId);

    expect(found).toBeDefined();
    expect(found?.isDeleted).toBe(false);
  });

  it("should only delete dataset for correct project (cross-project protection)", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "P1 Dataset" }
    );

    const wrongEntityId = new EntityId(dataset.id, new ProjectId(2, 1, 'test-user'));
    await datasetService.deleteDataSet(wrongEntityId);

    const correctEntityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));
    const found = await datasetService.getDataSetById(correctEntityId);

    expect(found).toBeDefined();
    expect(found?.isDeleted).toBe(false);
  });
});
