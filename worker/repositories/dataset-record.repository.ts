import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { dataSetRecords, type DataSetRecord, type NewDataSetRecord } from "../db/schema";
import type { DataSetIdentity, Pagination } from "../types/common";

export class DataSetRecordRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async createMany(records: NewDataSetRecord[]): Promise<DataSetRecord[]> {
    if (records.length === 0) return [];
    return await this.db.insert(dataSetRecords).values(records).returning();
  }

  async findById(params: {
    tenantId: number;
    projectId: number;
    recordId: number;
  }): Promise<DataSetRecord | undefined> {
    const [record] = await this.db
      .select()
      .from(dataSetRecords)
      .where(
        and(
          eq(dataSetRecords.tenantId, params.tenantId),
          eq(dataSetRecords.projectId, params.projectId),
          eq(dataSetRecords.id, params.recordId),
          eq(dataSetRecords.isDeleted, false)
        )
      )
      .limit(1);
    return record;
  }

  async listByDataSet(params: {
    tenantId: number;
    projectId: number;
    dataSetId: number;
  }): Promise<DataSetRecord[]> {
    return await this.db
      .select()
      .from(dataSetRecords)
      .where(
        and(
          eq(dataSetRecords.tenantId, params.tenantId),
          eq(dataSetRecords.projectId, params.projectId),
          eq(dataSetRecords.dataSetId, params.dataSetId),
          eq(dataSetRecords.isDeleted, false)
        )
      )
      .orderBy(desc(dataSetRecords.createdAt));
  }

  async listByDataSetPaginated(
    identity: DataSetIdentity,
    pagination: Pagination
  ): Promise<{ records: DataSetRecord[]; total: number }> {
    const offset = (pagination.page - 1) * pagination.pageSize;

    const [recordsResult, countResult] = await Promise.all([
      this.db
        .select()
        .from(dataSetRecords)
        .where(
          and(
            eq(dataSetRecords.tenantId, identity.tenantId),
            eq(dataSetRecords.projectId, identity.projectId),
            eq(dataSetRecords.dataSetId, identity.dataSetId),
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
            eq(dataSetRecords.tenantId, identity.tenantId),
            eq(dataSetRecords.projectId, identity.projectId),
            eq(dataSetRecords.dataSetId, identity.dataSetId),
            eq(dataSetRecords.isDeleted, false)
          )
        ),
    ]);

    return {
      records: recordsResult,
      total: countResult.length,
    };
  }

  async listBatchByProject(params: {
    tenantId: number;
    projectId: number;
    limit: number;
    afterId?: number;
  }): Promise<DataSetRecord[]> {
    const whereConditions = [
      eq(dataSetRecords.tenantId, params.tenantId),
      eq(dataSetRecords.projectId, params.projectId),
      eq(dataSetRecords.isDeleted, false),
    ];

    if (params.afterId !== undefined) {
      whereConditions.push(gt(dataSetRecords.id, params.afterId));
    }

    return await this.db
      .select()
      .from(dataSetRecords)
      .where(and(...whereConditions))
      .orderBy(asc(dataSetRecords.id))
      .limit(params.limit);
  }

  async listBatchByDataSet(params: {
    tenantId: number;
    projectId: number;
    dataSetId: number;
    limit: number;
    afterId?: number;
  }): Promise<DataSetRecord[]> {
    const whereConditions = [
      eq(dataSetRecords.tenantId, params.tenantId),
      eq(dataSetRecords.projectId, params.projectId),
      eq(dataSetRecords.dataSetId, params.dataSetId),
      eq(dataSetRecords.isDeleted, false),
    ];

    if (params.afterId !== undefined) {
      whereConditions.push(gt(dataSetRecords.id, params.afterId));
    }

    return await this.db
      .select()
      .from(dataSetRecords)
      .where(and(...whereConditions))
      .orderBy(asc(dataSetRecords.id))
      .limit(params.limit);
  }

  async softDeleteMany(
    identity: DataSetIdentity,
    recordIds: number[]
  ): Promise<number> {
    if (recordIds.length === 0) return 0;

    const result = await this.db
      .update(dataSetRecords)
      .set({ isDeleted: true })
      .where(
        and(
          eq(dataSetRecords.tenantId, identity.tenantId),
          eq(dataSetRecords.projectId, identity.projectId),
          eq(dataSetRecords.dataSetId, identity.dataSetId),
          inArray(dataSetRecords.id, recordIds),
          eq(dataSetRecords.isDeleted, false)
        )
      )
      .returning({ id: dataSetRecords.id });

    return result.length;
  }
}
