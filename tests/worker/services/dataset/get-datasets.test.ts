import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/services/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetService - getDataSets", () => {
  let datasetService: DataSetService;

  beforeEach(async () => {
    await applyMigrations();
    datasetService = new DataSetService(env.DB);
  });

  it("should return all datasets for tenant and project", async () => {
    const context = { tenantId: 1, projectId: 1 };

    await datasetService.createDataSet(context, { name: "Dataset 1" });
    await datasetService.createDataSet(context, { name: "Dataset 2" });

    const datasets = await datasetService.getDataSets(context);

    expect(datasets).toHaveLength(2);
    expect(datasets.map((d) => d.name)).toContain("Dataset 1");
    expect(datasets.map((d) => d.name)).toContain("Dataset 2");
  });

  it("should return empty array when no datasets exist", async () => {
    const datasets = await datasetService.getDataSets({
      tenantId: 1,
      projectId: 1,
    });

    expect(datasets).toEqual([]);
  });

  it("should only return datasets for specified tenant (cross-tenant protection)", async () => {
    await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "T1 Dataset" }
    );

    await datasetService.createDataSet(
      { tenantId: 2, projectId: 1 },
      { name: "T2 Dataset" }
    );

    const tenant1Datasets = await datasetService.getDataSets({
      tenantId: 1,
      projectId: 1,
    });

    const tenant2Datasets = await datasetService.getDataSets({
      tenantId: 2,
      projectId: 1,
    });

    expect(tenant1Datasets).toHaveLength(1);
    expect(tenant2Datasets).toHaveLength(1);
    expect(tenant1Datasets[0].name).toBe("T1 Dataset");
    expect(tenant2Datasets[0].name).toBe("T2 Dataset");
  });

  it("should only return datasets for specified project (cross-project protection)", async () => {
    await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "P1 Dataset" }
    );

    await datasetService.createDataSet(
      { tenantId: 1, projectId: 2 },
      { name: "P2 Dataset" }
    );

    const project1Datasets = await datasetService.getDataSets({
      tenantId: 1,
      projectId: 1,
    });

    const project2Datasets = await datasetService.getDataSets({
      tenantId: 1,
      projectId: 2,
    });

    expect(project1Datasets).toHaveLength(1);
    expect(project2Datasets).toHaveLength(1);
    expect(project1Datasets[0].name).toBe("P1 Dataset");
    expect(project2Datasets[0].name).toBe("P2 Dataset");
  });

  it("should exclude deleted datasets", async () => {
    const context = { tenantId: 1, projectId: 1 };

    const dataset1 = await datasetService.createDataSet(context, {
      name: "Active Dataset",
    });

    const dataset2 = await datasetService.createDataSet(context, {
      name: "To Delete",
    });

    // Delete one dataset
    await datasetService.deleteDataSet({
      ...context,
      dataSetId: dataset2.id,
    });

    const datasets = await datasetService.getDataSets(context);

    expect(datasets).toHaveLength(1);
    expect(datasets[0].id).toBe(dataset1.id);
  });
});
