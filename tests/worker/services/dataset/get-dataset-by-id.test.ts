import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/services/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";

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

    const found = await datasetService.getDataSetById({
      ...context,
      dataSetId: created.id,
    });

    expect(found).toBeDefined();
    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe("Test Dataset");
  });

  it("should return undefined for non-existent dataset", async () => {
    const found = await datasetService.getDataSetById({
      tenantId: 1,
      projectId: 1,
      dataSetId: 99999,
    });

    expect(found).toBeUndefined();
  });

  it("should return undefined for wrong tenant (cross-tenant protection)", async () => {
    const created = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "T1 Dataset" }
    );

    const found = await datasetService.getDataSetById({
      tenantId: 2,
      projectId: 1,
      dataSetId: created.id,
    });

    expect(found).toBeUndefined();
  });

  it("should return undefined for wrong project (cross-project protection)", async () => {
    const created = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "P1 Dataset" }
    );

    const found = await datasetService.getDataSetById({
      tenantId: 1,
      projectId: 2,
      dataSetId: created.id,
    });

    expect(found).toBeUndefined();
  });

  it("should return undefined for deleted dataset", async () => {
    const context = { tenantId: 1, projectId: 1 };
    const created = await datasetService.createDataSet(context, {
      name: "To Delete",
    });

    await datasetService.deleteDataSet({
      ...context,
      dataSetId: created.id,
    });

    const found = await datasetService.getDataSetById({
      ...context,
      dataSetId: created.id,
    });

    expect(found).toBeUndefined();
  });
});
