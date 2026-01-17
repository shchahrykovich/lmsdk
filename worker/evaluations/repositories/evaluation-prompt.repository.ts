import {asc, and, eq} from "drizzle-orm";
import {drizzle} from "drizzle-orm/d1";
import {evaluationPrompts, type EvaluationPrompt, type NewEvaluationPrompt} from "../../db/schema.ts";
import {EntityId} from "../../shared/entity-id";

export class EvaluationPromptRepository {
	private db;

	constructor(database: D1Database) {
		this.db = drizzle(database);
	}

	async createMany(records: NewEvaluationPrompt[]): Promise<EvaluationPrompt[]> {
		if (records.length === 0) return [];
		return await this.db.insert(evaluationPrompts).values(records).returning();
	}

	async listByEvaluation(id: EntityId): Promise<EvaluationPrompt[]> {
		return await this.db
			.select()
			.from(evaluationPrompts)
			.where(
				and(
					eq(evaluationPrompts.tenantId, id.tenantId),
					eq(evaluationPrompts.projectId, id.projectId),
					eq(evaluationPrompts.evaluationId, id.id)
				)
			)
			.orderBy(asc(evaluationPrompts.id));
	}
}
