import { drizzle } from "drizzle-orm/d1";
import { and, count, desc, eq } from "drizzle-orm";
import { evaluationEvents, type EvaluationEventRow } from "../../db/schema.ts";
import type { EntityId } from "../../shared/entity-id";
import type { EvaluationEvent, EvaluationEventDetails, EvaluationEventType, NewEvaluationEvent } from "../evaluation-event";

export class EvaluationEventRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async create(evaluationId: EntityId, event: NewEvaluationEvent): Promise<void> {
    await this.db.insert(evaluationEvents).values({
      tenantId: evaluationId.tenantId,
      projectId: evaluationId.projectId,
      evaluationId: evaluationId.id,
      type: event.type,
      recordId: event.recordId ?? null,
      promptId: event.promptId ?? null,
      versionId: event.versionId ?? null,
      details: JSON.stringify(event.details ?? {}),
    });
  }

  async listLatest(evaluationId: EntityId, limit: number): Promise<EvaluationEvent[]> {
    const rows = await this.db
      .select()
      .from(evaluationEvents)
      .where(this.byEvaluation(evaluationId))
      .orderBy(desc(evaluationEvents.id))
      .limit(limit);
    return rows.map(toEvaluationEvent);
  }

  async countByType(evaluationId: EntityId): Promise<Partial<Record<EvaluationEventType, number>>> {
    const rows = await this.db
      .select({ type: evaluationEvents.type, total: count() })
      .from(evaluationEvents)
      .where(this.byEvaluation(evaluationId))
      .groupBy(evaluationEvents.type);
    return Object.fromEntries(rows.map((row) => [row.type, row.total]));
  }

  async sumReusedCalls(evaluationId: EntityId): Promise<number> {
    const rows = await this.db
      .select({ details: evaluationEvents.details })
      .from(evaluationEvents)
      .where(and(this.byEvaluation(evaluationId), eq(evaluationEvents.type, "results_reused")));
    return rows.reduce((total, row) => total + (parseDetails(row.details).reusedCalls ?? 0), 0);
  }

  async countCallStarts(
    evaluationId: EntityId,
    call: { recordId: number; versionId: number }
  ): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(evaluationEvents)
      .where(
        and(
          this.byEvaluation(evaluationId),
          eq(evaluationEvents.type, "call_started"),
          eq(evaluationEvents.recordId, call.recordId),
          eq(evaluationEvents.versionId, call.versionId)
        )
      );
    return row?.total ?? 0;
  }

  private byEvaluation(evaluationId: EntityId) {
    return and(
      eq(evaluationEvents.tenantId, evaluationId.tenantId),
      eq(evaluationEvents.projectId, evaluationId.projectId),
      eq(evaluationEvents.evaluationId, evaluationId.id)
    );
  }
}

const parseDetails = (raw: string): EvaluationEventDetails => {
  try {
    const parsed = JSON.parse(raw) as EvaluationEventDetails | null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const toEvaluationEvent = (row: EvaluationEventRow): EvaluationEvent => ({
  id: row.id,
  type: row.type as EvaluationEventType,
  recordId: row.recordId,
  promptId: row.promptId,
  versionId: row.versionId,
  details: parseDetails(row.details),
  createdAt: row.createdAt,
});
