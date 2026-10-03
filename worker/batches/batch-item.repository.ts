import type { DrizzleD1Database } from "drizzle-orm/d1";
import { and, asc, eq, getTableColumns, gt, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { BatchItem as DrizzleBatchItem } from "drizzle-orm/batch";
import { batchItems, type BatchItem, type NewBatchItem } from "../db/schema";
import type { EntityId } from "../shared/entity-id";

export type BatchItemStatus = "pending" | "succeeded" | "errored" | "expired" | "cancelled";

export interface ItemLayout {
  id: number;
  partKey: string;
  byteOffset: number;
  bytes: number;
}

export interface PendingChange {
  status: Exclude<BatchItemStatus, "pending" | "succeeded">;
  error: string | null;
  at: Date;
  shardId?: number;
}

export interface ItemCompletion {
  id: number;
  status: Exclude<BatchItemStatus, "pending">;
  usage?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
  error?: string | null;
  hasResult?: boolean;
}

const D1_MAX_PARAMS = 100;
const ROWS_PER_INSERT = Math.floor(D1_MAX_PARAMS / Object.keys(getTableColumns(batchItems)).length);
const IN_CHUNK = 90;

const chunk = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

export class BatchItemRepository {
  private readonly db: DrizzleD1Database;

  constructor(db: DrizzleD1Database) {
    this.db = db;
  }

  private scope(batchId: EntityId<number>): SQL {
    return and(
      eq(batchItems.batchId, batchId.id),
      eq(batchItems.tenantId, batchId.tenantId),
      eq(batchItems.projectId, batchId.projectId)
    )!;
  }

  async findExistingCustomIds(batchId: EntityId<number>, customIds: string[]): Promise<Set<string>> {
    const existing = new Set<string>();
    for (const ids of chunk(customIds, IN_CHUNK)) {
      const rows = await this.db
        .select({ customId: batchItems.customId })
        .from(batchItems)
        .where(and(this.scope(batchId), inArray(batchItems.customId, ids)));
      rows.forEach((row) => existing.add(row.customId));
    }
    return existing;
  }

  buildInsertStatements(values: NewBatchItem[]): DrizzleBatchItem<"sqlite">[] {
    return chunk(values, ROWS_PER_INSERT).map((rows) => this.db.insert(batchItems).values(rows));
  }

  async deleteByPartKey(batchId: EntityId<number>, partKey: string): Promise<void> {
    await this.db.delete(batchItems).where(and(this.scope(batchId), eq(batchItems.partKey, partKey)));
  }

  async listLayout(batchId: EntityId<number>, afterId: number, limit: number): Promise<ItemLayout[]> {
    return await this.db
      .select({
        id: batchItems.id,
        partKey: batchItems.partKey,
        byteOffset: batchItems.byteOffset,
        bytes: batchItems.bytes,
      })
      .from(batchItems)
      .where(and(this.scope(batchId), gt(batchItems.id, afterId)))
      .orderBy(asc(batchItems.id))
      .limit(limit);
  }

  async assignShard(batchId: EntityId<number>, range: { firstId: number; lastId: number }, shardId: number): Promise<void> {
    await this.db
      .update(batchItems)
      .set({ shardId })
      .where(and(this.scope(batchId), gte(batchItems.id, range.firstId), lte(batchItems.id, range.lastId)));
  }

  async findIdsByLines(
    batchId: EntityId<number>,
    lines: { partKey: string; lineIndex: number }[]
  ): Promise<Map<string, number>> {
    const byPart = new Map<string, number[]>();
    for (const line of lines) {
      byPart.set(line.partKey, [...(byPart.get(line.partKey) ?? []), line.lineIndex]);
    }
    const ids = new Map<string, number>();
    for (const [partKey, indexes] of byPart) {
      for (const group of chunk(indexes, IN_CHUNK)) {
        const rows = await this.db
          .select({ id: batchItems.id, lineIndex: batchItems.lineIndex })
          .from(batchItems)
          .where(and(this.scope(batchId), eq(batchItems.partKey, partKey), inArray(batchItems.lineIndex, group)));
        rows.forEach((row) => ids.set(`${partKey}-${row.lineIndex}`, row.id));
      }
    }
    return ids;
  }

  async complete(batchId: EntityId<number>, completions: ItemCompletion[], at: Date): Promise<void> {
    if (completions.length === 0) return;
    const statements = completions.map(({ id, ...values }) =>
      this.db
        .update(batchItems)
        .set({ ...values, completedAt: at })
        .where(and(this.scope(batchId), eq(batchItems.id, id), eq(batchItems.status, "pending")))
    );
    const [first, ...rest] = statements;
    await this.db.batch([first!, ...rest]);
  }

  async markPending(batchId: EntityId<number>, change: PendingChange): Promise<void> {
    const { status, error, at, shardId } = change;
    await this.db
      .update(batchItems)
      .set({ status, error, completedAt: at })
      .where(
        and(
          this.scope(batchId),
          eq(batchItems.status, "pending"),
          shardId === undefined ? undefined : eq(batchItems.shardId, shardId)
        )
      );
  }

  async listPage(
    batchId: EntityId<number>,
    afterId: number,
    limit: number,
    status?: BatchItemStatus
  ): Promise<BatchItem[]> {
    return await this.db
      .select()
      .from(batchItems)
      .where(and(this.scope(batchId), gt(batchItems.id, afterId), status ? eq(batchItems.status, status) : undefined))
      .orderBy(asc(batchItems.id))
      .limit(limit);
  }

  async findItem(batchId: EntityId<number>, itemId: number): Promise<BatchItem | undefined> {
    const [item] = await this.db
      .select()
      .from(batchItems)
      .where(and(this.scope(batchId), eq(batchItems.id, itemId)))
      .limit(1);
    return item;
  }

  async countPending(batchId: EntityId<number>): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(batchItems)
      .where(and(this.scope(batchId), eq(batchItems.status, "pending")));
    return Number(row?.count ?? 0);
  }
}
