import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { DataSetRecordRepository } from "../../../../../worker/datasets/dataset-record.repository";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { applyMigrations } from "../../../helpers/db-setup";

const insertRecord = (tenantId: number, projectId: number, dataSetId: number, isDeleted = 0) =>
  env.DB.prepare(
    `INSERT INTO DataSetRecords (tenantId, projectId, dataSetId, variables, isDeleted) VALUES (?, ?, ?, '{}', ?)`
  ).bind(tenantId, projectId, dataSetId, isDeleted).run();

describe("DataSetRecordRepository.countByDataSet", () => {
  let repository: DataSetRecordRepository;
  const dataSetId = new EntityId(8, new ProjectId(2, 1, "user-1"));

  beforeEach(async () => {
    await applyMigrations();
    repository = new DataSetRecordRepository(env.DB);
  });

  it("counts the records of the data set that are not deleted", async () => {
    await insertRecord(1, 2, 8);
    await insertRecord(1, 2, 8);
    await insertRecord(1, 2, 8, 1);

    expect(await repository.countByDataSet(dataSetId)).toBe(2);
  });

  it("does not count records of another tenant, project or data set", async () => {
    await insertRecord(2, 2, 8);
    await insertRecord(1, 3, 8);
    await insertRecord(1, 2, 9);

    expect(await repository.countByDataSet(dataSetId)).toBe(0);
  });
});
