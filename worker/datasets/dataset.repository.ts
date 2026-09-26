import { drizzle } from "drizzle-orm/d1";
import { eq, and, sql } from "drizzle-orm";
import {dataSets, dataSetRecords, type DataSet, type DataSetRecord, type NewDataSet} from "../db/schema.ts";
import type {ProjectId} from "../shared/project-id";
import type {EntityId} from "../shared/entity-id";

const BOUND_VALUES_PER_STATEMENT = 100;
const BOUND_VALUES_PER_RECORD = 5;
const RECORDS_PER_STATEMENT = Math.floor(BOUND_VALUES_PER_STATEMENT / BOUND_VALUES_PER_RECORD);

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

  async addRecords(
    entityId: EntityId,
    variables: string[],
    schema: string,
    expectedSchema: string
  ): Promise<{ records: DataSetRecord[]; schemaSaved: boolean }> {
    const chunks: string[][] = [];
    for (let index = 0; index < variables.length; index += RECORDS_PER_STATEMENT) {
      chunks.push(variables.slice(index, index + RECORDS_PER_STATEMENT));
    }

    const inserts = chunks.map((chunk) =>
      this.db
        .insert(dataSetRecords)
        .values(
          chunk.map((value) => ({
            tenantId: entityId.tenantId,
            projectId: entityId.projectId,
            dataSetId: entityId.id,
            variables: value,
            isDeleted: false,
          }))
        )
        .returning()
    );

    const results = await this.db.batch([
      this.db
        .update(dataSets)
        .set({ countOfRecords: sql`${dataSets.countOfRecords} + ${variables.length}`, updatedAt: sql`(unixepoch())` })
        .where(entityId.toWhereClause(dataSets)),
      this.buildReplaceSchema(entityId, expectedSchema, schema),
      ...inserts,
    ]);

    const schemaRows = results[1] as { id: number }[];
    const insertedRows = results.slice(2) as DataSetRecord[][];
    return { records: insertedRows.flat(), schemaSaved: schemaRows.length > 0 };
  }

  async replaceSchema(entityId: EntityId, expectedSchema: string, schema: string): Promise<boolean> {
    const updated = await this.buildReplaceSchema(entityId, expectedSchema, schema);
    return updated.length > 0;
  }

  private buildReplaceSchema(entityId: EntityId, expectedSchema: string, schema: string) {
    return this.db
      .update(dataSets)
      .set({ schema, updatedAt: sql`(unixepoch())` })
      .where(and(entityId.toWhereClause(dataSets), eq(dataSets.schema, expectedSchema)))
      .returning({ id: dataSets.id });
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


}
