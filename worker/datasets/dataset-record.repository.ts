import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { dataSetRecords, type DataSetRecord, type NewDataSetRecord } from "../db/schema.ts";
import type { Pagination } from "../types/common.ts";
import type { ProjectId } from "../shared/project-id";
import type { EntityId } from "../shared/entity-id";

export class DataSetRecordRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async createMany(records: NewDataSetRecord[]): Promise<DataSetRecord[]> {
    if (records.length === 0) return [];
    return await this.db.insert(dataSetRecords).values(records).returning();
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
