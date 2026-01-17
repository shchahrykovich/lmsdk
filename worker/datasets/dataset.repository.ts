import { drizzle } from "drizzle-orm/d1";
import { eq, and, sql } from "drizzle-orm";
import {dataSets, type DataSet, type NewDataSet} from "../db/schema.ts";
import type {ProjectId} from "../shared/project-id";
import type {EntityId} from "../shared/entity-id";

export class DataSetRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async findByTenantAndProject(projectId: ProjectId): Promise<DataSet[]> {
    return await this.db
      .select()
      .from(dataSets)
      .where(
        and(
					projectId.toWhereClause(dataSets),
          eq(dataSets.isDeleted, false)
        )
      );
  }

  async findById(entityId: EntityId): Promise<DataSet | undefined> {
    const [dataset] = await this.db
      .select()
      .from(dataSets)
      .where(
        and(
					entityId.toWhereClause(dataSets),
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

  async incrementRecordCount(entityId: EntityId): Promise<void> {
    await this.db
      .update(dataSets)
      .set({
        countOfRecords: sql`${dataSets.countOfRecords} + 1`,
        updatedAt: sql`(unixepoch())`
      })
      .where(entityId.toWhereClause(dataSets));
  }

  async incrementRecordCountBy(
    entityId: EntityId,
    amount: number
  ): Promise<void> {
    if (amount === 0) return;
    await this.db
      .update(dataSets)
      .set({
        countOfRecords: sql`${dataSets.countOfRecords} + ${amount}`,
        updatedAt: sql`(unixepoch())`
      })
      .where(entityId.toWhereClause(dataSets));
  }

  async decrementRecordCount(entityId: EntityId): Promise<void> {
    await this.db
      .update(dataSets)
      .set({
        countOfRecords: sql`${dataSets.countOfRecords} - 1`,
        updatedAt: sql`(unixepoch())`
      })
      .where(entityId.toWhereClause(dataSets));
  }

  async softDelete(entityId: EntityId): Promise<void> {
    await this.db
      .update(dataSets)
      .set({
        isDeleted: true,
        updatedAt: sql`(unixepoch())`
      })
      .where(entityId.toWhereClause(dataSets));
  }

  async updateSchema(
    entityId: EntityId,
    schema: string
  ): Promise<void> {
    await this.db
      .update(dataSets)
      .set({
        schema,
        updatedAt: sql`(unixepoch())`
      })
      .where(entityId.toWhereClause(dataSets));
  }
}
