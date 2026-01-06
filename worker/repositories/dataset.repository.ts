import { drizzle } from "drizzle-orm/d1";
import { eq, and, sql } from "drizzle-orm";
import { dataSets, type DataSet, type NewDataSet } from "../db/schema";
import type { TenantProjectContext, DataSetContext } from "../types/common";

export class DataSetRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async findByTenantAndProject(context: TenantProjectContext): Promise<DataSet[]> {
    return await this.db
      .select()
      .from(dataSets)
      .where(
        and(
          eq(dataSets.tenantId, context.tenantId),
          eq(dataSets.projectId, context.projectId),
          eq(dataSets.isDeleted, false)
        )
      );
  }

  async findById(context: DataSetContext): Promise<DataSet | undefined> {
    const [dataset] = await this.db
      .select()
      .from(dataSets)
      .where(
        and(
          eq(dataSets.id, context.dataSetId),
          eq(dataSets.tenantId, context.tenantId),
          eq(dataSets.projectId, context.projectId),
          eq(dataSets.isDeleted, false)
        )
      )
      .limit(1);
    return dataset;
  }

  async findBySlug(context: {
    tenantId: number;
    projectId: number;
    slug: string;
  }): Promise<DataSet | undefined> {
    const [dataset] = await this.db
      .select()
      .from(dataSets)
      .where(
        and(
          eq(dataSets.tenantId, context.tenantId),
          eq(dataSets.projectId, context.projectId),
          eq(dataSets.slug, context.slug),
          eq(dataSets.isDeleted, false)
        )
      )
      .limit(1);
    return dataset;
  }

  async create(newDataSet: NewDataSet): Promise<DataSet> {
    const [dataset] = await this.db.insert(dataSets).values(newDataSet).returning();
    return dataset;
  }

  async incrementRecordCount(context: DataSetContext): Promise<void> {
    await this.db
      .update(dataSets)
      .set({
        countOfRecords: sql`${dataSets.countOfRecords} + 1`,
        updatedAt: sql`(unixepoch())`
      })
      .where(
        and(
          eq(dataSets.id, context.dataSetId),
          eq(dataSets.tenantId, context.tenantId),
          eq(dataSets.projectId, context.projectId)
        )
      );
  }

  async incrementRecordCountBy(
    context: DataSetContext,
    amount: number
  ): Promise<void> {
    if (amount <= 0) return;
    await this.db
      .update(dataSets)
      .set({
        countOfRecords: sql`${dataSets.countOfRecords} + ${amount}`,
        updatedAt: sql`(unixepoch())`
      })
      .where(
        and(
          eq(dataSets.id, context.dataSetId),
          eq(dataSets.tenantId, context.tenantId),
          eq(dataSets.projectId, context.projectId)
        )
      );
  }

  async decrementRecordCount(context: DataSetContext): Promise<void> {
    await this.db
      .update(dataSets)
      .set({
        countOfRecords: sql`${dataSets.countOfRecords} - 1`,
        updatedAt: sql`(unixepoch())`
      })
      .where(
        and(
          eq(dataSets.id, context.dataSetId),
          eq(dataSets.tenantId, context.tenantId),
          eq(dataSets.projectId, context.projectId)
        )
      );
  }

  async softDelete(context: DataSetContext): Promise<void> {
    await this.db
      .update(dataSets)
      .set({
        isDeleted: true,
        updatedAt: sql`(unixepoch())`
      })
      .where(
        and(
          eq(dataSets.id, context.dataSetId),
          eq(dataSets.tenantId, context.tenantId),
          eq(dataSets.projectId, context.projectId)
        )
      );
  }

  async updateSchema(
    context: DataSetContext,
    schema: string
  ): Promise<void> {
    await this.db
      .update(dataSets)
      .set({
        schema,
        updatedAt: sql`(unixepoch())`
      })
      .where(
        and(
          eq(dataSets.id, context.dataSetId),
          eq(dataSets.tenantId, context.tenantId),
          eq(dataSets.projectId, context.projectId)
        )
      );
  }
}
