import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { DataSetService } from "../../../../worker/datasets/dataset.service";
import { ClientInputValidationError, ConflictError, NotFoundError } from "../../../../worker/shared/errors";
import { EntityId } from "../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";
import { countRows, seedDataSet } from "../../helpers/seed";

describe("DataSetService - createDataSetRecords", () => {
  let service: DataSetService;
  const project = new ProjectId(1, 1, "test-user");

  beforeEach(async () => {
    await applyMigrations();
    service = new DataSetService(env.DB);
  });

  it("adds all records, raises the count and merges the schema", async () => {
    const dataset = await seedDataSet(project, "Tickets");
    const datasetId = new EntityId(dataset.id, project);

    const records = await service.createDataSetRecords(datasetId, [
      { ticket: "Refund please", priority: 1 },
      { ticket: "App crashes", tags: ["bug"] },
    ]);

    const row = await env.DB.prepare("SELECT countOfRecords, schema FROM DataSets WHERE id = ?")
      .bind(dataset.id)
      .first<{ countOfRecords: number; schema: string }>();
    expect(records).toHaveLength(2);
    expect(row?.countOfRecords).toBe(2);
    expect(JSON.parse(row!.schema).fields).toEqual({
      ticket: { type: "string" },
      priority: { type: "number" },
      tags: { type: "array" },
    });
  });

  it("adds 100 records in one call, above the D1 limit of 100 bound values per statement", async () => {
    const dataset = await seedDataSet(project, "Tickets");
    const datasetId = new EntityId(dataset.id, project);

    const records = await service.createDataSetRecords(
      datasetId,
      Array.from({ length: 100 }, (_, i) => ({ ticket: `t${i}` }))
    );

    const row = await env.DB.prepare("SELECT countOfRecords FROM DataSets WHERE id = ?")
      .bind(dataset.id)
      .first<{ countOfRecords: number }>();
    expect(records).toHaveLength(100);
    expect(await countRows("DataSetRecords")).toBe(100);
    expect(row?.countOfRecords).toBe(100);
  });

  it("keeps variables written by a parallel call when its own read of the schema is stale", async () => {
    const dataset = await seedDataSet(project, "Tickets");
    const datasetId = new EntityId(dataset.id, project);
    await service.createDataSetRecords(datasetId, [{ a: 1 }]);
    const staleDataSet = await service.getDataSetById(datasetId);
    await service.createDataSetRecords(datasetId, [{ x: "parallel" }]);
    const repository = (service as unknown as { repository: { findById: (id: EntityId) => Promise<unknown> } }).repository;
    vi.spyOn(repository, "findById").mockResolvedValueOnce(staleDataSet);

    await service.createDataSetRecords(datasetId, [{ y: true }]);

    const row = await env.DB.prepare("SELECT countOfRecords, schema FROM DataSets WHERE id = ?")
      .bind(dataset.id)
      .first<{ countOfRecords: number; schema: string }>();
    expect(row?.countOfRecords).toBe(3);
    expect(Object.keys(JSON.parse(row!.schema).fields).sort()).toEqual(["a", "x", "y"]);
  });

  it("rejects 0 and 101 records", async () => {
    const dataset = await seedDataSet(project, "Tickets");
    const datasetId = new EntityId(dataset.id, project);
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ i }));

    await expect(service.createDataSetRecords(datasetId, [])).rejects.toBeInstanceOf(ClientInputValidationError);
    await expect(service.createDataSetRecords(datasetId, tooMany)).rejects.toBeInstanceOf(ClientInputValidationError);
    expect(await countRows("DataSetRecords")).toBe(0);
  });

  it("throws NotFoundError for a dataset in another tenant", async () => {
    const dataset = await seedDataSet(project, "Tickets");
    const foreignId = new EntityId(dataset.id, new ProjectId(1, 2, "other-user"));

    await expect(service.createDataSetRecords(foreignId, [{ a: 1 }])).rejects.toBeInstanceOf(NotFoundError);
    expect(await countRows("DataSetRecords")).toBe(0);
  });
});

describe("DataSetService - createDataSet conflicts", () => {
  beforeEach(async () => {
    await applyMigrations();
  });

  it("throws ConflictError for a duplicate name in the same project", async () => {
    const project = new ProjectId(1, 1, "test-user");
    await seedDataSet(project, "Tickets");

    await expect(seedDataSet(project, "Tickets")).rejects.toBeInstanceOf(ConflictError);
  });
});
