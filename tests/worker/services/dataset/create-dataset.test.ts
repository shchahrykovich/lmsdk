import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/services/dataset.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { DataSet } from "../../../../worker/db/schema";

describe("DataSetService - createDataSet", () => {
  let datasetService: DataSetService;

  beforeEach(async () => {
    await applyMigrations();
    datasetService = new DataSetService(env.DB);
  });

  it("should create a dataset with valid input", async () => {
    const context = {
      tenantId: 1,
      projectId: 1,
    };

    const input = {
      name: "Test Dataset",
    };

    const dataset = await datasetService.createDataSet(context, input);

    expect(dataset).toBeDefined();
    expect(dataset.id).toBeGreaterThan(0);
    expect(dataset.name).toBe(input.name);
    expect(dataset.tenantId).toBe(context.tenantId);
    expect(dataset.projectId).toBe(context.projectId);
    expect(dataset.isDeleted).toBe(false);
    expect(dataset.countOfRecords).toBe(0);
    expect(dataset.schema).toBe("{}");
    expect(dataset.slug).toBe("test-dataset");
    expect(dataset.createdAt).toBeDefined();
    expect(dataset.updatedAt).toBeDefined();

    // Verify in database using direct SQL
    const dbResult = await env.DB.prepare(
      "SELECT * FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<DataSet>();

    expect(dbResult).toBeDefined();
    expect(dbResult?.name).toBe(input.name);
    expect(dbResult?.tenantId).toBe(context.tenantId);
    expect(dbResult?.projectId).toBe(context.projectId);
    expect(dbResult?.isDeleted).toBe(0); // SQLite stores boolean as 0/1
    expect(dbResult?.countOfRecords).toBe(0);
  });

  it("should create datasets for different tenants with same name", async () => {
    const input = {
      name: "Shared Dataset",
    };

    const dataset1 = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      input
    );

    const dataset2 = await datasetService.createDataSet(
      { tenantId: 2, projectId: 1 },
      input
    );

    expect(dataset1.id).not.toBe(dataset2.id);
    expect(dataset1.tenantId).toBe(1);
    expect(dataset2.tenantId).toBe(2);
    expect(dataset1.slug).toBe("shared-dataset");
    expect(dataset2.slug).toBe("shared-dataset");

    // Verify both exist in database
    const countResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM DataSets WHERE name = ?"
    )
      .bind("Shared Dataset")
      .first<{ count: number }>();

    expect(countResult?.count).toBe(2);
  });

  it("should create datasets for different projects", async () => {
    const input = {
      name: "Project Dataset",
    };

    const dataset1 = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      input
    );

    const dataset2 = await datasetService.createDataSet(
      { tenantId: 1, projectId: 2 },
      input
    );

    expect(dataset1.id).not.toBe(dataset2.id);
    expect(dataset1.projectId).toBe(1);
    expect(dataset2.projectId).toBe(2);
    expect(dataset1.slug).toBe("project-dataset");
    expect(dataset2.slug).toBe("project-dataset");
  });

  it("should initialize new datasets with zero records", async () => {
    const dataset = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Empty Dataset" }
    );

    expect(dataset.countOfRecords).toBe(0);
    expect(dataset.slug).toBe("empty-dataset");
  });

  it("should generate unique slugs per tenant and project", async () => {
    const dataset1 = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Duplicate Name" }
    );

    const dataset2 = await datasetService.createDataSet(
      { tenantId: 1, projectId: 1 },
      { name: "Duplicate-Name" }
    );

    expect(dataset1.slug).toBe("duplicate-name");
    expect(dataset2.slug).toBe("duplicate-name-2");
  });
});
