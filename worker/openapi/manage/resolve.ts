import type { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import type { HonoEnv } from "../../routes/app";
import { getUserFromContext } from "../../middleware/auth";
import { ProjectService } from "../../projects/project.service";
import { PromptService } from "../../prompts/prompt.service";
import { DataSetService } from "../../datasets/dataset.service";
import { EvaluationService } from "../../evaluations/evaluation.service";
import type { DataSet, Evaluation, Project, Prompt } from "../../db/schema";
import { ProjectId } from "../../shared/project-id";
import { EntityId } from "../../shared/entity-id";
import { NotFoundError } from "../../shared/errors";
import { batchServiceFor } from "../../batches/batch-service.factory";

const NUMERIC_ID = /^\d+$/;

export const isNumericId = (value: string): boolean => NUMERIC_ID.test(value);

export class ManageResolver {
  private readonly c: Context<HonoEnv>;

  constructor(c: Context<HonoEnv>) {
    this.c = c;
  }

  async project(slugOrId: string): Promise<{ project: Project; projectId: ProjectId }> {
    const user = getUserFromContext(this.c);
    const service = new ProjectService(drizzle(this.c.env.DB));
    const project =
      (await service.getProjectBySlug(user.tenantId, slugOrId)) ??
      (isNumericId(slugOrId)
        ? await service.getProjectById(new ProjectId(Number(slugOrId), user.tenantId, user.id))
        : undefined);

    if (!project?.isActive) {
      throw new NotFoundError("Project not found");
    }

    return { project, projectId: new ProjectId(project.id, user.tenantId, user.id) };
  }

  async prompt(projectId: ProjectId, slugOrId: string): Promise<{ prompt: Prompt; promptId: EntityId<number> }> {
    const service = new PromptService(drizzle(this.c.env.DB));
    const prompt =
      (await service.getPromptBySlug(projectId, slugOrId)) ??
      (isNumericId(slugOrId) ? await service.getPromptById(new EntityId(Number(slugOrId), projectId)) : null);

    if (!prompt?.isActive) {
      throw new NotFoundError("Prompt not found");
    }

    return { prompt, promptId: new EntityId(prompt.id, projectId) };
  }

  async dataSet(projectId: ProjectId, slugOrId: string): Promise<{ dataSet: DataSet; dataSetId: EntityId<number> }> {
    const service = new DataSetService(this.c.env.DB);
    const dataSet =
      (await service.getDataSetBySlug(projectId, slugOrId)) ??
      (isNumericId(slugOrId) ? await service.getDataSetById(new EntityId(Number(slugOrId), projectId)) : undefined);

    if (!dataSet) {
      throw new NotFoundError("Dataset not found");
    }

    return { dataSet, dataSetId: new EntityId(dataSet.id, projectId) };
  }

  async evaluation(projectId: ProjectId, slugOrId: string): Promise<{ evaluation: Evaluation; evaluationId: EntityId<number> }> {
    const service = new EvaluationService(this.c.env.DB);
    const evaluation =
      (await service.getEvaluationBySlug(projectId, slugOrId)) ??
      (isNumericId(slugOrId) ? await service.getEvaluation(new EntityId(Number(slugOrId), projectId)) : undefined);

    if (!evaluation) {
      throw new NotFoundError("Evaluation not found");
    }

    return { evaluation, evaluationId: new EntityId(evaluation.id, projectId) };
  }

  async batch(projectId: ProjectId, id: string): Promise<{ batchId: EntityId<number> }> {
    if (!isNumericId(id)) {
      throw new NotFoundError("Batch not found");
    }
    const batchId = new EntityId(Number(id), projectId);
    await batchServiceFor(this.c.env).requireBatch(batchId);
    return { batchId };
  }
}
