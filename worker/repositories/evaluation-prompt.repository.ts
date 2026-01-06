import { asc, and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { evaluationPrompts, type EvaluationPrompt, type NewEvaluationPrompt } from "../db/schema";

export class EvaluationPromptRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async createMany(records: NewEvaluationPrompt[]): Promise<EvaluationPrompt[]> {
    if (records.length === 0) return [];
    return await this.db.insert(evaluationPrompts).values(records).returning();
  }

  async listByEvaluation(params: {
    tenantId: number;
    projectId: number;
    evaluationId: number;
  }): Promise<EvaluationPrompt[]> {
    return await this.db
      .select()
      .from(evaluationPrompts)
      .where(
        and(
          eq(evaluationPrompts.tenantId, params.tenantId),
          eq(evaluationPrompts.projectId, params.projectId),
          eq(evaluationPrompts.evaluationId, params.evaluationId)
        )
      )
      .orderBy(asc(evaluationPrompts.id));
  }
}
