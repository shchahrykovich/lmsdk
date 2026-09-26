import { and, asc, count, desc, eq, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { dataSetRecords, type DataSetRecord } from "../db/schema.ts";
import type { Pagination } from "../types/common.ts";
import type { ProjectId } from "../shared/project-id";
import type { EntityId } from "../shared/entity-id";

export class DataSetRecordRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async findById(recordId: EntityId): Promise<DataSetRecord | undefined> {
    const [record] = await this.db
      .select()
      .from(dataSetRecords)
      .where(
        and(
          recordId.toWhereClause(dataSetRecords),
          eq(dataSetRecords.isDeleted, false)
        )
      )
      .limit(1);
    return record;
  }

  async listByDataSet(dataSetId: EntityId): Promise<DataSetRecord[]> {
    return await this.db
      .select()
      .from(dataSetRecords)
      .where(
        and(
          eq(dataSetRecords.tenantId, dataSetId.tenantId),
          eq(dataSetRecords.projectId, dataSetId.projectId),
          eq(dataSetRecords.dataSetId, dataSetId.id),
          eq(dataSetRecords.isDeleted, false)
        )
      )
      .orderBy(desc(dataSetRecords.createdAt));
  }

  async listByDataSetPaginated(
    dataSetId: EntityId,
    pagination: Pagination
  ): Promise<{ records: DataSetRecord[]; total: number }> {
    const offset = (pagination.page - 1) * pagination.pageSize;

    const [recordsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(dataSetRecords)
        .where(
          and(
            eq(dataSetRecords.tenantId, dataSetId.tenantId),
            eq(dataSetRecords.projectId, dataSetId.projectId),
            eq(dataSetRecords.dataSetId, dataSetId.id),
            eq(dataSetRecords.isDeleted, false)
          )
        )
        .orderBy(desc(dataSetRecords.createdAt))
        .limit(pagination.pageSize)
        .offset(offset),
      this.db
        .select({ count: dataSetRecords.id })
        .from(dataSetRecords)
        .where(
          and(
            eq(dataSetRecords.tenantId, dataSetId.tenantId),
            eq(dataSetRecords.projectId, dataSetId.projectId),
            eq(dataSetRecords.dataSetId, dataSetId.id),
            eq(dataSetRecords.isDeleted, false)
          )
        ),
    ]);

    return {
      records: recordsResult,
      total: countResult.length,
    };
  }

  async listBatchByProject(
    projectId: ProjectId,
    limit: number,
    afterId?: number
  ): Promise<DataSetRecord[]> {
    const whereConditions = [
      projectId.toWhereClause(dataSetRecords)!,
      eq(dataSetRecords.isDeleted, false),
    ];

    if (afterId !== undefined) {
      whereConditions.push(gt(dataSetRecords.id, afterId));
    }

    return await this.db
      .select()
      .from(dataSetRecords)
      .where(and(...whereConditions))
      .orderBy(asc(dataSetRecords.id))
      .limit(limit);
  }

  async countByDataSet(dataSetId: EntityId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(dataSetRecords)
      .where(
        and(
          eq(dataSetRecords.tenantId, dataSetId.tenantId),
          eq(dataSetRecords.projectId, dataSetId.projectId),
          eq(dataSetRecords.dataSetId, dataSetId.id),
          eq(dataSetRecords.isDeleted, false)
        )
      );
    return row?.total ?? 0;
  }

  async listBatchByDataSet(
    dataSetId: EntityId,
    limit: number,
    afterId?: number
  ): Promise<DataSetRecord[]> {
    const whereConditions = [
      eq(dataSetRecords.tenantId, dataSetId.tenantId),
      eq(dataSetRecords.projectId, dataSetId.projectId),
      eq(dataSetRecords.dataSetId, dataSetId.id),
      eq(dataSetRecords.isDeleted, false),
    ];

    if (afterId !== undefined) {
      whereConditions.push(gt(dataSetRecords.id, afterId));
    }

    return await this.db
      .select()
      .from(dataSetRecords)
      .where(and(...whereConditions))
      .orderBy(asc(dataSetRecords.id))
      .limit(limit);
  }

  async softDeleteMany(
    dataSetId: EntityId,
    recordIds: number[]
  ): Promise<number> {
    if (recordIds.length === 0) return 0;

    const result = await this.db
      .update(dataSetRecords)
      .set({ isDeleted: true })
      .where(
        and(
          eq(dataSetRecords.tenantId, dataSetId.tenantId),
          eq(dataSetRecords.projectId, dataSetId.projectId),
          eq(dataSetRecords.dataSetId, dataSetId.id),
          inArray(dataSetRecords.id, recordIds),
          eq(dataSetRecords.isDeleted, false)
        )
      )
      .returning({ id: dataSetRecords.id });

    return result.length;
  }
}
