import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("DataSetRepository - updateSchema", () => {
  let repository: DataSetRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new DataSetRepository(env.DB);
  });

  it("should update schema for the dataset", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Schema Dataset",
      slug: "schema-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const nextSchema = JSON.stringify({
      fields: {
        "user.name": { type: "string" },
      },
    });

    await repository.updateSchema(
      { tenantId: 1, projectId: 1, dataSetId: dataset.id },
      nextSchema
    );

    const result = await env.DB.prepare(
      "SELECT schema FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ schema: string }>();

    expect(result?.schema).toBe(nextSchema);
  });

  it("should not update schema for other tenants", async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Tenant Dataset",
      slug: "tenant-dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    await repository.updateSchema(
      { tenantId: 2, projectId: 1, dataSetId: dataset.id },
      '{"fields":{"count":{"type":"number"}}}'
    );

    const result = await env.DB.prepare(
      "SELECT schema FROM DataSets WHERE id = ?"
    )
      .bind(dataset.id)
      .first<{ schema: string }>();

    expect(result?.schema).toBe("{}");
  });
});
