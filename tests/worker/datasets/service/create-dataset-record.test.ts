import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/datasets/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";
import {EntityId} from "../../../../worker/shared/entity-id";
import {ProjectId} from "../../../../worker/shared/project-id";

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

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

    const variables = {
      name: "John Doe",
      age: 30,
      active: true,
    };

    const record = await datasetService.createDataSetRecord(entityId, variables);

    expect(record).toBeDefined();
    expect(record.id).toBeGreaterThan(0);
    expect(record.tenantId).toBe(1);
    expect(record.projectId).toBe(1);
    expect(record.dataSetId).toBe(dataset.id);
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

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

    const variables = {
      username: "johndoe",
      score: 95,
      verified: true,
    };

    await datasetService.createDataSetRecord(entityId, variables);

    const updatedDataset = await datasetService.getDataSetById(entityId);

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

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

    expect(dataset.countOfRecords).toBe(0);

    await datasetService.createDataSetRecord(entityId, { test: "data1" });

    let updatedDataset = await datasetService.getDataSetById(entityId);
    expect(updatedDataset?.countOfRecords).toBe(1);

    await datasetService.createDataSetRecord(entityId, { test: "data2" });

    updatedDataset = await datasetService.getDataSetById(entityId);
    expect(updatedDataset?.countOfRecords).toBe(2);
  });

  it("should handle nested object variables", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Nested Test" }
    );

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

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

    const record = await datasetService.createDataSetRecord(entityId, variables);

    const parsedVariables = JSON.parse(record.variables ?? "{}");
    expect(parsedVariables).toEqual(variables);

    const updatedDataset = await datasetService.getDataSetById(entityId);
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

    const entityId = new EntityId(dataset.id, new ProjectId(1, 2, 'test-user'));

    await expect(
      datasetService.createDataSetRecord(entityId, { test: "data" })
    ).rejects.toThrow("Dataset not found");
  });

  it("should throw error if dataset does not exist", async () => {
    const entityId = new EntityId(999999, new ProjectId(1, 1, 'test-user'));

    await expect(
      datasetService.createDataSetRecord(entityId, { test: "data" })
    ).rejects.toThrow("Dataset not found");
  });

  it("should handle array variables", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Array Test" }
    );

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, 'test-user'));

    const variables = {
      tags: ["javascript", "typescript", "react"],
      scores: [95, 87, 92],
    };

    const record = await datasetService.createDataSetRecord(entityId, variables);

    const parsedVariables = JSON.parse(record.variables ?? "{}");
    expect(parsedVariables).toEqual(variables);

    const updatedDataset = await datasetService.getDataSetById(entityId);
    const schema = JSON.parse(updatedDataset?.schema ?? "{}");

    expect(schema.fields.tags).toEqual({ type: "array" });
    expect(schema.fields.scores).toEqual({ type: "array" });
  });
});
