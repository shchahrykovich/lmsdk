import { drizzle } from "drizzle-orm/d1";
import { eq, and, inArray, notExists, sql, max } from "drizzle-orm";
import { alias, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import { dataSetRecords, evaluationPrompts, evaluationResults, type EvaluationResult, type NewEvaluationResult } from "../../db/schema.ts";
import type { EntityId } from "../../shared/entity-id";

export interface StoredResult {
  dataSetRecordId: number;
  versionId: number;
  result: string;
}

export class EvaluationResultRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async create(record: NewEvaluationResult): Promise<EvaluationResult> {
    const [result] = await this.db
      .insert(evaluationResults)
      .values(record)
      .returning();
    return result;
  }

  async findByEvaluation(params: {
    tenantId: number;
    projectId: number;
    evaluationId: number;
  }): Promise<EvaluationResult[]> {
    return await this.db
      .select()
      .from(evaluationResults)
      .where(
        and(
          eq(evaluationResults.tenantId, params.tenantId),
          eq(evaluationResults.projectId, params.projectId),
          eq(evaluationResults.evaluationId, params.evaluationId)
        )
      );
  }

  async listForRecords(evaluationId: EntityId, recordIds: number[]): Promise<StoredResult[]> {
    if (recordIds.length === 0) return [];
    return await this.db
      .select({
        dataSetRecordId: evaluationResults.dataSetRecordId,
        versionId: evaluationResults.versionId,
        result: evaluationResults.result,
      })
      .from(evaluationResults)
      .where(and(this.byEvaluation(evaluationResults, evaluationId), inArray(evaluationResults.dataSetRecordId, recordIds)));
  }

  async copyFromEvaluation(target: EntityId, baseEvaluationId: number, dataSetId: number): Promise<number> {
    const source = alias(evaluationResults, "source");
    const latest = alias(evaluationResults, "latest");
    const existing = alias(evaluationResults, "existing");

    const latestSourceId = this.db
      .select({ id: max(latest.id) })
      .from(latest)
      .where(
        and(
          eq(latest.tenantId, source.tenantId),
          eq(latest.projectId, source.projectId),
          eq(latest.evaluationId, source.evaluationId),
          eq(latest.dataSetRecordId, source.dataSetRecordId),
          eq(latest.versionId, source.versionId)
        )
      );

    const targetVersionIds = this.db
      .select({ versionId: evaluationPrompts.versionId })
      .from(evaluationPrompts)
      .where(this.byEvaluation(evaluationPrompts, target));

    const alreadyStored = this.db
      .select({ id: existing.id })
      .from(existing)
      .where(
        and(
          this.byEvaluation(existing, target),
          eq(existing.dataSetRecordId, source.dataSetRecordId),
          eq(existing.versionId, source.versionId)
        )
      );

    const copied = await this.db.insert(evaluationResults).select(
      this.db
        .select({
          id: sql<number>`NULL`.as("id"),
          tenantId: source.tenantId,
          projectId: source.projectId,
          evaluationId: sql<number>`${target.id}`.as("evaluationId"),
          dataSetRecordId: source.dataSetRecordId,
          promptId: source.promptId,
          versionId: source.versionId,
          result: source.result,
          durationMs: source.durationMs,
          stats: source.stats,
          createdAt: sql<Date>`(unixepoch())`.as("createdAt"),
          updatedAt: sql<Date>`(unixepoch())`.as("updatedAt"),
        })
        .from(source)
        .innerJoin(
          dataSetRecords,
          and(
            eq(dataSetRecords.id, source.dataSetRecordId),
            eq(dataSetRecords.tenantId, target.tenantId),
            eq(dataSetRecords.projectId, target.projectId),
            eq(dataSetRecords.dataSetId, dataSetId),
            eq(dataSetRecords.isDeleted, false)
          )
        )
        .where(
          and(
            eq(source.tenantId, target.tenantId),
            eq(source.projectId, target.projectId),
            eq(source.evaluationId, baseEvaluationId),
            eq(source.id, latestSourceId),
            inArray(source.versionId, targetVersionIds),
            notExists(alreadyStored)
          )
        )
    );
    return copied.meta.changes;
  }

  private byEvaluation(
    table: { tenantId: SQLiteColumn; projectId: SQLiteColumn; evaluationId: SQLiteColumn },
    evaluationId: EntityId
  ) {
    return and(
      eq(table.tenantId, evaluationId.tenantId),
      eq(table.projectId, evaluationId.projectId),
      eq(table.evaluationId, evaluationId.id)
    );
  }
}
