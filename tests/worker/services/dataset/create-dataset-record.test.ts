import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/services/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetService - createDataSetRecord", () => {
  let datasetService: DataSetService;

  beforeEach(async () => {
    await applyMigrations();
    datasetService = new DataSetService(env.DB);
  });

  it("should create a record with simple variables", async () => {
    // Create a dataset first
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Test Dataset" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const variables = {
      name: "John Doe",
      age: 30,
      active: true,
    };

    const record = await datasetService.createDataSetRecord(context, variables);

    expect(record).toBeDefined();
    expect(record.id).toBeGreaterThan(0);
    expect(record.tenantId).toBe(context.tenantId);
    expect(record.projectId).toBe(context.projectId);
    expect(record.dataSetId).toBe(context.dataSetId);
    expect(record.isDeleted).toBe(false);

    // Verify variables
    const parsedVariables = JSON.parse(record.variables ?? "{}");
    expect(parsedVariables).toEqual(variables);

    // Verify in database using direct SQL
    const dbResult = await env.DB.prepare(
      "SELECT * FROM DataSetRecords WHERE id = ?"
    )
      .bind(record.id)
      .first<{ variables: string }>();

    expect(dbResult).toBeDefined();
    expect(JSON.parse(dbResult?.variables ?? "{}")).toEqual(variables);
  });

  it("should update dataset schema when creating record", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Schema Test" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const variables = {
      username: "johndoe",
      score: 95,
      verified: true,
    };

    await datasetService.createDataSetRecord(context, variables);

    // Fetch updated dataset
    const updatedDataset = await datasetService.getDataSetById(context);

    expect(updatedDataset).toBeDefined();
    const schema = JSON.parse(updatedDataset?.schema ?? "{}");

    expect(schema.fields).toBeDefined();
    expect(schema.fields.username).toEqual({ type: "string" });
    expect(schema.fields.score).toEqual({ type: "number" });
    expect(schema.fields.verified).toEqual({ type: "boolean" });
  });

  it("should increment dataset record count", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Count Test" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    expect(dataset.countOfRecords).toBe(0);

    await datasetService.createDataSetRecord(context, { test: "data1" });

    let updatedDataset = await datasetService.getDataSetById(context);
    expect(updatedDataset?.countOfRecords).toBe(1);

    await datasetService.createDataSetRecord(context, { test: "data2" });

    updatedDataset = await datasetService.getDataSetById(context);
    expect(updatedDataset?.countOfRecords).toBe(2);
  });

  it("should handle nested object variables", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Nested Test" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const variables = {
      user: {
        name: "Jane",
        email: "jane@example.com",
      },
      metadata: {
        source: "api",
        version: 2,
      },
    };

    const record = await datasetService.createDataSetRecord(context, variables);

    const parsedVariables = JSON.parse(record.variables ?? "{}");
    expect(parsedVariables).toEqual(variables);

    // Verify schema includes nested paths
    const updatedDataset = await datasetService.getDataSetById(context);
    const schema = JSON.parse(updatedDataset?.schema ?? "{}");

    expect(schema.fields["user.name"]).toEqual({ type: "string" });
    expect(schema.fields["user.email"]).toEqual({ type: "string" });
    expect(schema.fields["metadata.source"]).toEqual({ type: "string" });
    expect(schema.fields["metadata.version"]).toEqual({ type: "number" });
  });

  it("should enforce cross-tenant protection", async () => {
    // Create dataset for tenant 1
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Tenant 1 Dataset" }
    );

    // Try to create record with tenant 2 context
    const context = {
      tenantId: 2,
      projectId: 1,
      dataSetId: dataset.id,
    };

    await expect(
      datasetService.createDataSetRecord(context, { test: "data" })
    ).rejects.toThrow("Dataset not found");
  });

  it("should throw error if dataset does not exist", async () => {
    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: 999999,
    };

    await expect(
      datasetService.createDataSetRecord(context, { test: "data" })
    ).rejects.toThrow("Dataset not found");
  });

  it("should handle array variables", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Array Test" }
    );

    const context = {
      tenantId: 1,
      projectId: 1,
      dataSetId: dataset.id,
    };

    const variables = {
      tags: ["javascript", "typescript", "react"],
      scores: [95, 87, 92],
    };

    const record = await datasetService.createDataSetRecord(context, variables);

    const parsedVariables = JSON.parse(record.variables ?? "{}");
    expect(parsedVariables).toEqual(variables);

    // Verify schema
    const updatedDataset = await datasetService.getDataSetById(context);
    const schema = JSON.parse(updatedDataset?.schema ?? "{}");

    expect(schema.fields.tags).toEqual({ type: "array" });
    expect(schema.fields.scores).toEqual({ type: "array" });
  });
});
