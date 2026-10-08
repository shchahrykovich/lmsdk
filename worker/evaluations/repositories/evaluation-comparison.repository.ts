import { drizzle } from "drizzle-orm/d1";
import { and, asc, eq } from "drizzle-orm";
import { evaluationComparisons, type EvaluationComparison } from "../../db/schema.ts";
import type { EntityId } from "../../shared/entity-id";

export interface ComparisonKey {
  recordId: number;
  leftVersionId: number;
  rightVersionId: number;
}

export interface ComparisonReview {
  description: string | null;
  score: number | null;
}

export class EvaluationComparisonRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async upsert(evaluationId: EntityId, key: ComparisonKey, review: ComparisonReview): Promise<EvaluationComparison> {
    const now = new Date();
    const [saved] = await this.db
      .insert(evaluationComparisons)
      .values({
        tenantId: evaluationId.tenantId,
        projectId: evaluationId.projectId,
        evaluationId: evaluationId.id,
        dataSetRecordId: key.recordId,
        leftVersionId: key.leftVersionId,
        rightVersionId: key.rightVersionId,
        description: review.description,
        score: review.score,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          evaluationComparisons.evaluationId,
          evaluationComparisons.dataSetRecordId,
          evaluationComparisons.leftVersionId,
          evaluationComparisons.rightVersionId,
        ],
        set: { description: review.description, score: review.score, updatedAt: now },
      })
      .returning();
    return saved;
  }

  async listByEvaluation(evaluationId: EntityId): Promise<EvaluationComparison[]> {
    return await this.db
      .select()
      .from(evaluationComparisons)
      .where(
        and(
          eq(evaluationComparisons.tenantId, evaluationId.tenantId),
          eq(evaluationComparisons.projectId, evaluationId.projectId),
          eq(evaluationComparisons.evaluationId, evaluationId.id)
        )
      )
      .orderBy(asc(evaluationComparisons.dataSetRecordId), asc(evaluationComparisons.id));
  }
}
