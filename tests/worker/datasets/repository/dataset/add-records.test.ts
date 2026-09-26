import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRepository } from "../../../../../worker/datasets/dataset.repository";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { applyMigrations } from "../../../helpers/db-setup";
import { countRows } from "../../../helpers/seed";

describe("DataSetRepository - addRecords", () => {
  let repository: DataSetRepository;
  const project = new ProjectId(1, 1, "test-user");

  beforeEach(async () => {
    await applyMigrations();
    repository = new DataSetRepository(env.DB);
  });

  const seed = async () => {
    const dataset = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Tickets",
      slug: "tickets",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });
    return new EntityId(dataset.id, project);
  };

  const readDataSet = async (id: number) =>
    await env.DB.prepare("SELECT countOfRecords, schema FROM DataSets WHERE id = ?")
      .bind(id)
      .first<{ countOfRecords: number; schema: string }>();

  it("inserts the records and updates count and schema together", async () => {
    const datasetId = await seed();

    const { records } = await repository.addRecords(datasetId, ['{"a":1}', '{"a":2}'], '{"fields":{"a":{"type":"number"}}}', "{}");

    expect(records.map((r) => r.variables)).toEqual(['{"a":1}', '{"a":2}']);
    expect(await readDataSet(datasetId.id)).toEqual({
      countOfRecords: 2,
      schema: '{"fields":{"a":{"type":"number"}}}',
    });
  });

  it("changes nothing when a record in a later chunk fails", async () => {
    const datasetId = await seed();
    const variables = Array.from({ length: 45 }, (_, i) => `{"i":${i}}`);
    variables[44] = null as unknown as string;

    await expect(repository.addRecords(datasetId, variables, '{"fields":{}}', "{}")).rejects.toThrow();

    expect(await countRows("DataSetRecords")).toBe(0);
    expect(await readDataSet(datasetId.id)).toEqual({ countOfRecords: 0, schema: "{}" });
  });

  it("changes nothing when the record insert fails", async () => {
    const datasetId = await seed();

    await expect(
      repository.addRecords(datasetId, ['{"a":1}', null as unknown as string], '{"fields":{"a":{"type":"number"}}}', "{}")
    ).rejects.toThrow();

    expect(await countRows("DataSetRecords")).toBe(0);
    expect(await readDataSet(datasetId.id)).toEqual({ countOfRecords: 0, schema: "{}" });
  });
});
