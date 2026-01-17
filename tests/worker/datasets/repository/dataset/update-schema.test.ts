import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRepository } from "../../../../../worker/datasets/dataset.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { EntityId } from "../../../../../worker/shared/entity-id";

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

    const entityId = new EntityId(dataset.id, new ProjectId(1, 1, ""));
    await repository.updateSchema(entityId, nextSchema);

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

    const wrongEntityId = new EntityId(dataset.id, new ProjectId(1, 2, ""));
    await repository.updateSchema(
      wrongEntityId,
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
