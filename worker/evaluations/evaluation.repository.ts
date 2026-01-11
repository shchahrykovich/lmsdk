import { drizzle } from "drizzle-orm/d1";
import { and, eq, desc, count } from "drizzle-orm";
import { evaluations, type Evaluation, type NewEvaluation } from "../db/schema";
import type { EntityId } from "../shared/entity-id";
import type { ProjectId } from "../shared/project-id";
import type { Pagination } from "../types/common";

export class EvaluationRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async findByTenantAndProject(
    projectId: ProjectId
  ): Promise<Evaluation[]> {
    return await this.db
      .select()
      .from(evaluations)
      .where(projectId.toWhereClause(evaluations))
      .orderBy(desc(evaluations.createdAt));
  }

  async findByTenantAndProjectPaginated(
    projectId: ProjectId,
    pagination: Pagination
  ): Promise<Evaluation[]> {
    const offset = (pagination.page - 1) * pagination.pageSize;
    return await this.db
      .select()
      .from(evaluations)
      .where(projectId.toWhereClause(evaluations))
      .orderBy(desc(evaluations.createdAt))
      .limit(pagination.pageSize)
      .offset(offset);
  }

  async countByTenantAndProject(
    projectId: ProjectId
  ): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(evaluations)
      .where(projectId.toWhereClause(evaluations));
    return result?.count ?? 0;
  }

  async findByName(
    projectId: ProjectId,
    name: string
  ): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .select()
      .from(evaluations)
      .where(
        and(
          projectId.toWhereClause(evaluations),
          eq(evaluations.name, name)
        )
      )
      .limit(1);
    return evaluation;
  }

  async findBySlug(
    projectId: ProjectId,
    slug: string
  ): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .select()
      .from(evaluations)
      .where(
        and(
					projectId.toWhereClause(evaluations),
          eq(evaluations.slug, slug)
        )
      )
      .limit(1);
    return evaluation;
  }

  async findById(
    entityId: EntityId
  ): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .select()
      .from(evaluations)
      .where(entityId.toWhereClause(evaluations))
      .limit(1);
    return evaluation;
  }

  async create(newEvaluation: NewEvaluation): Promise<Evaluation> {
    const [evaluation] = await this.db
      .insert(evaluations)
      .values(newEvaluation)
      .returning();
    return evaluation;
  }

  async updateWorkflowId(
    entityId: EntityId,
    workflowId: string
  ): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .update(evaluations)
      .set({
        workflowId: workflowId,
        updatedAt: new Date(),
      })
      .where(entityId.toWhereClause(evaluations))
      .returning();
    return evaluation;
  }

  async markRunning(
    entityId: EntityId
  ): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .update(evaluations)
      .set({
        state: "running",
        updatedAt: new Date(),
      })
			.where(entityId.toWhereClause(evaluations))
      .returning();
    return evaluation;
  }

  async markFinished(
    entityId: EntityId,
    durationMs: number
  ): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .update(evaluations)
      .set({
        state: "finished",
        durationMs: durationMs,
        updatedAt: new Date(),
      })
			.where(entityId.toWhereClause(evaluations))
      .returning();
    return evaluation;
  }

  async updateOutputSchema(
    entityId: EntityId,
    outputSchema: string
  ): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .update(evaluations)
      .set({
        outputSchema: outputSchema,
        updatedAt: new Date(),
      })
			.where(entityId.toWhereClause(evaluations))
      .returning();
    return evaluation;
  }

  async delete(
    entityId: EntityId
  ): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .delete(evaluations)
			.where(entityId.toWhereClause(evaluations))
      .returning();
    return evaluation;
  }
}
