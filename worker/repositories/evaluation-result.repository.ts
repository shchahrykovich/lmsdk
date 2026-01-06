import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { evaluationResults, type EvaluationResult, type NewEvaluationResult } from "../db/schema";

export class EvaluationResultRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async create(record: NewEvaluationResult): Promise<EvaluationResult> {
    const [result] = await this.db
      .insert(evaluationResults)
      .values(record)
      .returning();
    return result;
  }

  async findByEvaluation(params: {
    tenantId: number;
    projectId: number;
    evaluationId: number;
  }): Promise<EvaluationResult[]> {
    return await this.db
      .select()
      .from(evaluationResults)
      .where(
        and(
          eq(evaluationResults.tenantId, params.tenantId),
          eq(evaluationResults.projectId, params.projectId),
          eq(evaluationResults.evaluationId, params.evaluationId)
        )
      );
  }
}
