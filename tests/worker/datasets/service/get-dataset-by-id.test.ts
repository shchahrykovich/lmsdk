import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/datasets/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";
import {EntityId} from "../../../../worker/shared/entity-id";
import {ProjectId} from "../../../../worker/shared/project-id";

describe("DataSetService - getDataSetById", () => {
  let datasetService: DataSetService;

  beforeEach(async () => {
    await applyMigrations();
    datasetService = new DataSetService(env.DB);
  });

  it("should return dataset by id", async () => {
    const context = { tenantId: 1, projectId: 1 };
    const created = await datasetService.createDataSet(context, {
      name: "Test Dataset",
    });

		const entityId = new EntityId(created.id, new ProjectId(context.projectId, context.tenantId, ''));
    const found = await datasetService.getDataSetById(entityId);

    expect(found).toBeDefined();
    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe("Test Dataset");
  });

  it("should return undefined for non-existent dataset", async () => {
		const entityId = new EntityId(99999, new ProjectId(1, 1, ''));
    const found = await datasetService.getDataSetById(entityId);

    expect(found).toBeUndefined();
  });

  it("should return undefined for wrong tenant (cross-tenant protection)", async () => {
    const created = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "T1 Dataset" }
    );

		const entityId = new EntityId(created.id, new ProjectId(1, 2, ''));
    const found = await datasetService.getDataSetById(entityId);

    expect(found).toBeUndefined();
  });

  it("should return undefined for wrong project (cross-project protection)", async () => {
    const created = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "P1 Dataset" }
    );

		const entityId = new EntityId(created.id, new ProjectId(2, 1, ''));
    const found = await datasetService.getDataSetById(entityId);

    expect(found).toBeUndefined();
  });

  it("should return undefined for deleted dataset", async () => {
    const created = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "To Delete" }
    );

    const entityId = new EntityId(created.id, new ProjectId(1, 1, 'test-user'));
    await datasetService.deleteDataSet(entityId);

    const found = await datasetService.getDataSetById(entityId);

    expect(found).toBeUndefined();
  });
});
