import { drizzle } from "drizzle-orm/d1";
import { and, eq, desc, count, sql, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { evaluations, evaluationPrompts, type Evaluation, type NewEvaluation } from "../../db/schema.ts";
import type { EntityId } from "../../shared/entity-id.ts";
import type { ProjectId } from "../../shared/project-id.ts";
import type { Pagination } from "../../types/common.ts";

export const WORKFLOW_START_PENDING = "pending";

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

  async createWithPrompts(
    newEvaluation: NewEvaluation,
    prompts: { promptId: number; versionId: number }[]
  ): Promise<Evaluation> {
    const evaluationBySlug = and(
      eq(evaluations.tenantId, newEvaluation.tenantId),
      eq(evaluations.projectId, newEvaluation.projectId),
      eq(evaluations.slug, newEvaluation.slug)
    );

    const promptStatements: BatchItem<"sqlite">[] = prompts.map((prompt) =>
      this.db.insert(evaluationPrompts).select(
        this.db
          .select({
            id: sql<number>`NULL`.as("id"),
            tenantId: evaluations.tenantId,
            projectId: evaluations.projectId,
            evaluationId: evaluations.id,
            promptId: sql<number>`${prompt.promptId}`.as("promptId"),
            versionId: sql<number>`${prompt.versionId}`.as("versionId"),
            createdAt: sql<Date>`(unixepoch())`.as("createdAt"),
          })
          .from(evaluations)
          .where(evaluationBySlug)
      )
    );

    const [created] = await this.db.batch([
      this.db.insert(evaluations).values(newEvaluation).returning(),
      ...promptStatements,
    ]);
    return created[0];
  }

  async claimWorkflowStart(entityId: EntityId): Promise<boolean> {
    const claimed = await this.db
      .update(evaluations)
      .set({ workflowId: WORKFLOW_START_PENDING, updatedAt: new Date() })
      .where(and(entityId.toWhereClause(evaluations), isNull(evaluations.workflowId)))
      .returning({ id: evaluations.id });
    return claimed.length > 0;
  }

  async releaseWorkflowStart(entityId: EntityId): Promise<void> {
    await this.db
      .update(evaluations)
      .set({ workflowId: null, updatedAt: new Date() })
      .where(and(entityId.toWhereClause(evaluations), eq(evaluations.workflowId, WORKFLOW_START_PENDING)));
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

  async markFailed(
    entityId: EntityId,
    durationMs: number
  ): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .update(evaluations)
      .set({
        state: "failed",
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

  async updateSummary(
    entityId: EntityId,
    summary: string | null
  ): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .update(evaluations)
      .set({ summary, updatedAt: new Date() })
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
