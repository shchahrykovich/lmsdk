import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationResultRepository } from "../../../../../worker/evaluations/repositories/evaluation-result.repository";
import { EntityId } from "../../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { applyMigrations } from "../../../helpers/db-setup";

const BASE = 1;
const TARGET = 2;
const DATASET = 8;
const OLD_VERSION = 100;
const NEW_VERSION = 101;
const OTHER_VERSION = 102;

const target = (tenantId = 1) => new EntityId(TARGET, new ProjectId(1, tenantId, "user-1"));

const insertRecord = (id: number, isDeleted = 0, dataSetId = DATASET) =>
  env.DB.prepare(`INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables, isDeleted) VALUES (?, 1, 1, ?, '{}', ?)`)
    .bind(id, dataSetId, isDeleted)
    .run();

const insertResult = (evaluationId: number, recordId: number, versionId: number, content: string, tenantId = 1) =>
  env.DB.prepare(
    `INSERT INTO EvaluationResults (tenantId, projectId, evaluationId, dataSetRecordId, promptId, versionId, result, durationMs, stats)
     VALUES (?, 1, ?, ?, 10, ?, ?, 500, '{"usage":{}}')`
  ).bind(tenantId, evaluationId, recordId, versionId, JSON.stringify({ content })).run();

const targetRows = async () =>
  (
    await env.DB.prepare(
      `SELECT tenantId, projectId, dataSetRecordId, versionId, result, durationMs FROM EvaluationResults WHERE evaluationId = ? ORDER BY dataSetRecordId, versionId`
    ).bind(TARGET).all<{ tenantId: number; projectId: number; dataSetRecordId: number; versionId: number; result: string; durationMs: number }>()
  ).results;

describe("EvaluationResultRepository.copyFromEvaluation", () => {
  let repository: EvaluationResultRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationResultRepository(env.DB);
    await env.DB.prepare(
      `INSERT INTO EvaluationPrompts (tenantId, projectId, evaluationId, promptId, versionId) VALUES (1, 1, ?, 10, ?), (1, 1, ?, 10, ?)`
    ).bind(TARGET, OLD_VERSION, TARGET, NEW_VERSION).run();
    await insertRecord(1);
    await insertRecord(2);
  });

  it("copies the base results of the versions that the target evaluation also runs", async () => {
    await insertResult(BASE, 1, OLD_VERSION, "old 1");
    await insertResult(BASE, 2, OLD_VERSION, "old 2");
    await insertResult(BASE, 1, OTHER_VERSION, "other 1");

    const copied = await repository.copyFromEvaluation(target(), BASE, DATASET);

    expect(copied).toBe(2);
    const rows = await targetRows();
    expect(rows.map((row) => [row.dataSetRecordId, row.versionId, JSON.parse(row.result).content, row.durationMs])).toEqual([
      [1, OLD_VERSION, "old 1", 500],
      [2, OLD_VERSION, "old 2", 500],
    ]);
    expect(rows.every((row) => row.tenantId === 1 && row.projectId === 1)).toBe(true);
  });

  it("skips deleted records and records of another dataset", async () => {
    await insertRecord(3, 1);
    await insertRecord(4, 0, 9);
    await insertResult(BASE, 3, OLD_VERSION, "deleted record");
    await insertResult(BASE, 4, OLD_VERSION, "other dataset");

    expect(await repository.copyFromEvaluation(target(), BASE, DATASET)).toBe(0);
    expect(await targetRows()).toEqual([]);
  });

  it("copies only the newest base result when the base has a duplicate, and never copies twice", async () => {
    await insertResult(BASE, 1, OLD_VERSION, "first try");
    await insertResult(BASE, 1, OLD_VERSION, "retry");

    expect(await repository.copyFromEvaluation(target(), BASE, DATASET)).toBe(1);
    expect(await repository.copyFromEvaluation(target(), BASE, DATASET)).toBe(0);

    const rows = await targetRows();
    expect(rows.map((row) => JSON.parse(row.result).content)).toEqual(["retry"]);
  });

  it("does not copy results of another tenant", async () => {
    await insertResult(BASE, 1, OLD_VERSION, "tenant 2 data", 2);

    expect(await repository.copyFromEvaluation(target(1), BASE, DATASET)).toBe(0);
    expect(await targetRows()).toEqual([]);
  });
});
