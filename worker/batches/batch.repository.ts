import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { BatchItem as DrizzleBatchItem } from "drizzle-orm/batch";
import { and, asc, count, desc, eq, getTableColumns, inArray, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import {
  batches,
  batchItems,
  batchShards,
  prompts,
  type Batch,
  type BatchShard,
  type NewBatch,
  type NewBatchShard,
} from "../db/schema";
import type { EntityId } from "../shared/entity-id";
import type { ProjectId } from "../shared/project-id";

export type BatchState = "draft" | "submitting" | "running" | "finished" | "failed" | "cancelled";

export const TERMINAL_BATCH_STATES: readonly BatchState[] = ["finished", "failed", "cancelled"];

export const ACTIVE_BATCH_STATES: readonly BatchState[] = ["submitting", "running"];

export type BatchWithPrompt = Batch & { promptName: string | null; promptSlug: string | null };

export interface ProjectBatchPage {
  offset: number;
  limit: number;
  states?: readonly BatchState[];
}

const itemCount = (batchId: SQL | number, status: string) =>
  sql<number>`(SELECT COUNT(*) FROM ${batchItems} WHERE ${batchItems.batchId} = ${batchId} AND ${batchItems.status} = ${status})`;

const itemSum = (batchId: number, column: SQL) =>
  sql`(SELECT COALESCE(SUM(${column}), 0) FROM ${batchItems} WHERE ${batchItems.batchId} = ${batchId})`;

export class BatchRepository {
  private readonly db: DrizzleD1Database;

  constructor(db: DrizzleD1Database) {
    this.db = db;
  }

  async findById(batchId: EntityId<number>): Promise<Batch | undefined> {
    const [batch] = await this.db.select().from(batches).where(batchId.toWhereClause(batches)).limit(1);
    return batch;
  }

  async findByIdempotencyKey(promptId: EntityId<number>, key: string): Promise<Batch | undefined> {
    const [batch] = await this.db
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.tenantId, promptId.tenantId),
          eq(batches.projectId, promptId.projectId),
          eq(batches.promptId, promptId.id),
          eq(batches.idempotencyKey, key)
        )
      )
      .limit(1);
    return batch;
  }

  async create(values: NewBatch): Promise<Batch> {
    const [batch] = await this.db.insert(batches).values(values).returning();
    if (!batch) {
      throw new Error("Failed to create batch");
    }
    return batch;
  }

  async listByPrompt(promptId: EntityId<number>, limit: number, beforeId?: number): Promise<Batch[]> {
    return await this.db
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.tenantId, promptId.tenantId),
          eq(batches.projectId, promptId.projectId),
          eq(batches.promptId, promptId.id),
          beforeId === undefined ? undefined : lt(batches.id, beforeId)
        )
      )
      .orderBy(desc(batches.id))
      .limit(limit);
  }

  async findWithPrompt(batchId: EntityId<number>): Promise<BatchWithPrompt | undefined> {
    const [batch] = await this.selectWithPrompt().where(batchId.toWhereClause(batches)).limit(1);
    return batch;
  }

  async listByProject(projectId: ProjectId, page: ProjectBatchPage): Promise<BatchWithPrompt[]> {
    return await this.selectWithPrompt()
      .where(this.projectScope(projectId, page.states))
      .orderBy(desc(batches.id))
      .limit(page.limit)
      .offset(page.offset);
  }

  async countByProject(projectId: ProjectId, states?: readonly BatchState[]): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(batches).where(this.projectScope(projectId, states));
    return row?.total ?? 0;
  }

  private selectWithPrompt() {
    return this.db
      .select({ ...getTableColumns(batches), promptName: prompts.name, promptSlug: prompts.slug })
      .from(batches)
      .leftJoin(
        prompts,
        and(eq(prompts.id, batches.promptId), eq(prompts.tenantId, batches.tenantId), eq(prompts.projectId, batches.projectId))
      );
  }

  private projectScope(projectId: ProjectId, states?: readonly BatchState[]): SQL | undefined {
    return and(projectId.toWhereClause(batches), states && states.length > 0 ? inArray(batches.state, [...states]) : undefined);
  }

  buildAddTotalsStatement(batchId: EntityId<number>, items: number, bytes: number): DrizzleBatchItem<"sqlite"> {
    return this.db
      .update(batches)
      .set({
        totalItems: sql`${batches.totalItems} + ${items}`,
        totalBytes: sql`${batches.totalBytes} + ${bytes}`,
        updatedAt: new Date(),
      })
      .where(and(batchId.toWhereClause(batches), eq(batches.state, "draft")))
      .returning({ id: batches.id });
  }

  async transitionState(
    batchId: EntityId<number>,
    from: BatchState,
    to: BatchState,
    extra: Partial<NewBatch> = {}
  ): Promise<boolean> {
    const updated = await this.db
      .update(batches)
      .set({ ...extra, state: to, updatedAt: new Date() })
      .where(and(batchId.toWhereClause(batches), eq(batches.state, from)))
      .returning({ id: batches.id });
    return updated.length > 0;
  }

  async update(batchId: EntityId<number>, values: Partial<NewBatch>): Promise<void> {
    await this.db
      .update(batches)
      .set({ ...values, updatedAt: new Date() })
      .where(batchId.toWhereClause(batches));
  }

  async requestCancel(batchId: EntityId<number>, at: Date): Promise<void> {
    await this.db
      .update(batches)
      .set({ cancelRequestedAt: at, updatedAt: at })
      .where(
        and(
          batchId.toWhereClause(batches),
          inArray(batches.state, ["submitting", "running"]),
          sql`${batches.cancelRequestedAt} IS NULL`
        )
      );
  }

  async refreshTotals(batchId: EntityId<number>): Promise<void> {
    const id = batchId.id;
    await this.db
      .update(batches)
      .set({
        succeededCount: itemCount(id, "succeeded"),
        erroredCount: itemCount(id, "errored"),
        expiredCount: itemCount(id, "expired"),
        cancelledCount: itemCount(id, "cancelled"),
        promptTokens: itemSum(id, sql`${batchItems.promptTokens}`),
        completionTokens: itemSum(id, sql`${batchItems.completionTokens}`),
        totalTokens: itemSum(id, sql`${batchItems.totalTokens}`),
        costUsd: itemSum(id, sql`${batchItems.costUsd}`),
        unpricedCount: sql<number>`(SELECT COUNT(*) FROM ${batchItems} WHERE ${batchItems.batchId} = ${id} AND ${batchItems.status} = 'succeeded' AND ${batchItems.costUsd} IS NULL)`,
        updatedAt: new Date(),
      })
      .where(batchId.toWhereClause(batches));
  }

  async listShards(batchId: EntityId<number>): Promise<BatchShard[]> {
    return await this.db
      .select()
      .from(batchShards)
      .where(
        and(
          eq(batchShards.batchId, batchId.id),
          eq(batchShards.tenantId, batchId.tenantId),
          eq(batchShards.projectId, batchId.projectId)
        )
      )
      .orderBy(asc(batchShards.seq));
  }

  async insertShards(values: NewBatchShard[]): Promise<BatchShard[]> {
    if (values.length === 0) return [];
    const inserted: BatchShard[] = [];
    for (const value of values) {
      const [shard] = await this.db.insert(batchShards).values(value).returning();
      if (shard) inserted.push(shard);
    }
    return inserted;
  }

  async updateShard(batchId: EntityId<number>, shardId: number, values: Partial<NewBatchShard>): Promise<void> {
    await this.db
      .update(batchShards)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(batchShards.id, shardId),
          eq(batchShards.batchId, batchId.id),
          eq(batchShards.tenantId, batchId.tenantId),
          eq(batchShards.projectId, batchId.projectId)
        )
      );
  }

  async findExpired(now: Date, limit: number): Promise<Batch[]> {
    return await this.db
      .select()
      .from(batches)
      .where(
        and(
          isNotNull(batches.resultsExpireAt),
          lt(batches.resultsExpireAt, now),
          inArray(batches.state, ["draft", ...TERMINAL_BATCH_STATES])
        )
      )
      .orderBy(asc(batches.resultsExpireAt))
      .limit(limit);
  }

  async deleteBatch(batchId: EntityId<number>): Promise<void> {
    await this.db.batch([
      this.db
        .delete(batchItems)
        .where(
          and(
            eq(batchItems.batchId, batchId.id),
            eq(batchItems.tenantId, batchId.tenantId),
            eq(batchItems.projectId, batchId.projectId)
          )
        ),
      this.db
        .delete(batchShards)
        .where(
          and(
            eq(batchShards.batchId, batchId.id),
            eq(batchShards.tenantId, batchId.tenantId),
            eq(batchShards.projectId, batchId.projectId)
          )
        ),
      this.db.delete(batches).where(batchId.toWhereClause(batches)),
    ]);
  }
}
