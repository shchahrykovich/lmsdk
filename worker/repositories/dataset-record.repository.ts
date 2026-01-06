import { and, asc, desc, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { dataSetRecords, type DataSetRecord, type NewDataSetRecord } from "../db/schema";

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
}
