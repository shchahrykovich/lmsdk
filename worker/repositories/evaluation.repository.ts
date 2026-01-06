import { drizzle } from "drizzle-orm/d1";
import { and, eq, desc } from "drizzle-orm";
import { evaluations, type Evaluation, type NewEvaluation } from "../db/schema";
import type { TenantProjectContext } from "../types/common";

export class EvaluationRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  async findByTenantAndProject(
    context: TenantProjectContext
  ): Promise<Evaluation[]> {
    return await this.db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.tenantId, context.tenantId),
          eq(evaluations.projectId, context.projectId)
        )
      )
      .orderBy(desc(evaluations.createdAt));
  }

  async findByName(params: {
    tenantId: number;
    projectId: number;
    name: string;
  }): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.tenantId, params.tenantId),
          eq(evaluations.projectId, params.projectId),
          eq(evaluations.name, params.name)
        )
      )
      .limit(1);
    return evaluation;
  }

  async findBySlug(params: {
    tenantId: number;
    projectId: number;
    slug: string;
  }): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.tenantId, params.tenantId),
          eq(evaluations.projectId, params.projectId),
          eq(evaluations.slug, params.slug)
        )
      )
      .limit(1);
    return evaluation;
  }

  async findById(params: {
    tenantId: number;
    projectId: number;
    evaluationId: number;
  }): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.tenantId, params.tenantId),
          eq(evaluations.projectId, params.projectId),
          eq(evaluations.id, params.evaluationId)
        )
      )
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

  async updateWorkflowId(params: {
    tenantId: number;
    projectId: number;
    evaluationId: number;
    workflowId: string;
  }): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .update(evaluations)
      .set({
        workflowId: params.workflowId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(evaluations.tenantId, params.tenantId),
          eq(evaluations.projectId, params.projectId),
          eq(evaluations.id, params.evaluationId)
        )
      )
      .returning();
    return evaluation;
  }

  async markRunning(params: {
    tenantId: number;
    projectId: number;
    evaluationId: number;
  }): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .update(evaluations)
      .set({
        state: "running",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(evaluations.tenantId, params.tenantId),
          eq(evaluations.projectId, params.projectId),
          eq(evaluations.id, params.evaluationId)
        )
      )
      .returning();
    return evaluation;
  }

  async markFinished(params: {
    tenantId: number;
    projectId: number;
    evaluationId: number;
    durationMs: number;
  }): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .update(evaluations)
      .set({
        state: "finished",
        durationMs: params.durationMs,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(evaluations.tenantId, params.tenantId),
          eq(evaluations.projectId, params.projectId),
          eq(evaluations.id, params.evaluationId)
        )
      )
      .returning();
    return evaluation;
  }

  async updateOutputSchema(params: {
    tenantId: number;
    projectId: number;
    evaluationId: number;
    outputSchema: string;
  }): Promise<Evaluation | undefined> {
    const [evaluation] = await this.db
      .update(evaluations)
      .set({
        outputSchema: params.outputSchema,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(evaluations.tenantId, params.tenantId),
          eq(evaluations.projectId, params.projectId),
          eq(evaluations.id, params.evaluationId)
        )
      )
      .returning();
    return evaluation;
  }
}
