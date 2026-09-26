import { drizzle } from "drizzle-orm/d1";
import type { Evaluation } from "../db/schema";
import { EvaluationRepository, WORKFLOW_START_PENDING } from "./repositories/evaluation.repository";
import { EvaluationPromptRepository } from "./repositories/evaluation-prompt.repository";
import { EvaluationResultRepository } from "./repositories/evaluation-result.repository";
import { EvaluationEventRepository } from "./repositories/evaluation-event.repository";
import type { EvaluationEvent, NewEvaluationEvent } from "./evaluation-event";
import { DataSetRecordRepository } from "../datasets/dataset-record.repository";
import { DataSetRepository } from "../datasets/dataset.repository";
import { PromptRepository } from "../prompts/prompt.repository";
import { EntityId } from "../shared/entity-id";
import { ProjectId } from "../shared/project-id";
import { ClientInputValidationError, ConflictError, conflictOnDuplicate } from "../shared/errors";
import type { EvaluationWorkflowParams } from "../workflows/evaluation.workflow";

export type EvaluationWorkflowBinding = Workflow<EvaluationWorkflowParams>;

export interface CreateEvaluationPromptInput {
  promptId: number;
  versionId: number;
}

export interface CreateEvaluationInput {
  name: string;
  type: "run" | "comparison";
  datasetId: number;
  prompts: CreateEvaluationPromptInput[];
}

export interface EvaluationProgress {
  totalCalls: number;
  succeededCalls: number;
  sentAttempts: number;
  failedAttempts: number;
  lastEventAt: Date | null;
}

export interface EvaluationActivity {
  events: EvaluationEvent[];
  progress: EvaluationProgress;
}

const ACTIVITY_EVENT_LIMIT = 100;

export class EvaluationService {
  private repository: EvaluationRepository;
  private promptRepository: EvaluationPromptRepository;
  private resultRepository: EvaluationResultRepository;
  private eventRepository: EvaluationEventRepository;
  private recordRepository: DataSetRecordRepository;
  private datasetRepository: DataSetRepository;
  private promptRepo: PromptRepository;

  constructor(db: D1Database) {
    this.repository = new EvaluationRepository(db);
    this.promptRepository = new EvaluationPromptRepository(db);
    this.resultRepository = new EvaluationResultRepository(db);
    this.eventRepository = new EvaluationEventRepository(db);
    this.recordRepository = new DataSetRecordRepository(db);
    this.datasetRepository = new DataSetRepository(db);
    this.promptRepo = new PromptRepository(drizzle(db));
  }

  async getEvaluations(
    projectId: ProjectId
  ): Promise<
    (Evaluation & {
      datasetName: string | null;
      prompts: { promptId: number; versionId: number; promptName: string; version: number }[];
    })[]
  > {
    const evaluations = await this.repository.findByTenantAndProject(projectId);

    // Fetch dataset names and prompts for each evaluation
    const evaluationsWithDetails = await Promise.all(
      evaluations.map(async (evaluation) => {
        // Fetch dataset name
        let datasetName: string | null = null;
        if (evaluation.datasetId) {
					const dataSetEntityId = new EntityId(evaluation.datasetId, projectId);
          const dataset = await this.datasetRepository.findById(dataSetEntityId);
          datasetName = dataset?.name ?? null;
        }

        // Fetch prompts
				const evaluationId = new EntityId(evaluation.id, projectId);
        const evaluationPrompts = await this.promptRepository.listByEvaluation(evaluationId);

        const prompts = await Promise.all(
          evaluationPrompts.map(async (ep) => {
						const promptId = new EntityId(ep.promptId, projectId);
            const prompt = await this.promptRepo.findPromptById(promptId);
            const version = await this.promptRepo.findPromptVersionById(projectId, ep.versionId);
            return {
              promptId: ep.promptId,
              versionId: ep.versionId,
              promptName: prompt?.name ?? `Prompt ${ep.promptId}`,
              version: version?.version ?? 0,
            };
          })
        );

        return {
          ...evaluation,
          datasetName,
          prompts,
        };
      })
    );

    return evaluationsWithDetails;
  }

  async getEvaluationsPaginated(
    projectId: ProjectId,
    page: number,
    pageSize: number
  ): Promise<{
    evaluations: (Evaluation & {
      datasetName: string | null;
      prompts: { promptId: number; versionId: number; promptName: string; version: number }[];
    })[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const [evaluations, total] = await Promise.all([
      this.repository.findByTenantAndProjectPaginated(projectId, { page, pageSize }),
      this.repository.countByTenantAndProject(projectId),
    ]);

    // Fetch dataset names and prompts for each evaluation
    const evaluationsWithDetails = await Promise.all(
      evaluations.map(async (evaluation) => {
        // Fetch dataset name
        let datasetName: string | null = null;
        if (evaluation.datasetId) {
					const dataSetEntityId = new EntityId(evaluation.datasetId, projectId);
          const dataset = await this.datasetRepository.findById(dataSetEntityId);
          datasetName = dataset?.name ?? null;
        }

        // Fetch prompts
				const evaluationId = new EntityId(evaluation.id, projectId);
        const evaluationPrompts = await this.promptRepository.listByEvaluation(evaluationId);

        const prompts = await Promise.all(
          evaluationPrompts.map(async (ep) => {
						const promptId = new EntityId(ep.promptId, projectId);
            const prompt = await this.promptRepo.findPromptById(promptId);
            const version = await this.promptRepo.findPromptVersionById(projectId, ep.versionId);
            return {
              promptId: ep.promptId,
              versionId: ep.versionId,
              promptName: prompt?.name ?? `Prompt ${ep.promptId}`,
              version: version?.version ?? 0,
            };
          })
        );

        return {
          ...evaluation,
          datasetName,
          prompts,
        };
      })
    );

    const totalPages = Math.ceil(total / pageSize);

    return {
      evaluations: evaluationsWithDetails,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async listEvaluationRows(
    projectId: ProjectId,
    page: number,
    pageSize: number
  ): Promise<{ evaluations: Evaluation[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const [evaluations, total] = await Promise.all([
      this.repository.findByTenantAndProjectPaginated(projectId, { page, pageSize }),
      this.repository.countByTenantAndProject(projectId),
    ]);
    return { evaluations, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async createEvaluation(
    projectId: ProjectId,
    input: CreateEvaluationInput
  ): Promise<Evaluation> {
    const existingByName = await this.repository.findByName(projectId, input.name);

    if (existingByName) {
      throw new ConflictError("Evaluation name already exists");
    }

    await this.ensureInputsBelongToProject(projectId, input);

    const baseSlug = this.generateSlug(input.name);
    let slug = baseSlug;
    let attempt = 1;

    while (await this.repository.findBySlug(projectId, slug)) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    return await conflictOnDuplicate(
      () =>
        this.repository.createWithPrompts(
          {
            tenantId: projectId.tenantId,
            projectId: projectId.id,
            datasetId: input.datasetId,
            name: input.name,
            slug,
            type: input.type,
            state: "created",
            workflowId: null,
            durationMs: null,
            inputSchema: "{}",
            outputSchema: "{}",
          },
          input.prompts
        ),
      "Evaluation name already exists"
    );
  }

  private async ensureInputsBelongToProject(
    projectId: ProjectId,
    input: CreateEvaluationInput
  ): Promise<void> {
    const dataset = await this.datasetRepository.findById(new EntityId(input.datasetId, projectId));
    if (!dataset) {
      throw new ClientInputValidationError("Dataset not found in this project");
    }

    for (const prompt of input.prompts) {
      const version = await this.promptRepo.findPromptVersionById(projectId, prompt.versionId);
      if (version?.promptId !== prompt.promptId) {
        throw new ClientInputValidationError(
          `Version ${prompt.versionId} of prompt ${prompt.promptId} not found in this project`
        );
      }
    }
  }

  async createAndStartEvaluation(
    projectId: ProjectId,
    input: CreateEvaluationInput,
    workflow: EvaluationWorkflowBinding
  ): Promise<Evaluation> {
    const existing = await this.repository.findByName(projectId, input.name);
    const evaluation = existing
      ? await this.reuseUnstartedEvaluation(projectId, existing, input)
      : await this.createEvaluation(projectId, input);

    return await this.startWorkflow(new EntityId(evaluation.id, projectId), workflow);
  }

  private async reuseUnstartedEvaluation(
    projectId: ProjectId,
    existing: Evaluation,
    input: CreateEvaluationInput
  ): Promise<Evaluation> {
    const unstarted = existing.workflowId === null && existing.state === "created";
    if (!unstarted || !(await this.hasSameDefinition(new EntityId(existing.id, projectId), existing, input))) {
      throw new ConflictError("Evaluation name already exists");
    }
    return existing;
  }

  private async hasSameDefinition(
    entityId: EntityId,
    existing: Evaluation,
    input: CreateEvaluationInput
  ): Promise<boolean> {
    const toKey = (prompts: { promptId: number; versionId: number }[]) =>
      prompts.map((prompt) => `${prompt.promptId}:${prompt.versionId}`).sort((a, b) => a.localeCompare(b)).join(",");
    const stored = await this.promptRepository.listByEvaluation(entityId);
    return existing.datasetId === input.datasetId && existing.type === input.type && toKey(stored) === toKey(input.prompts);
  }

  private async startWorkflow(entityId: EntityId, workflow: EvaluationWorkflowBinding): Promise<Evaluation> {
    if (!(await this.repository.claimWorkflowStart(entityId))) {
      throw new ConflictError("Evaluation is already being started");
    }

    let instance: WorkflowInstance;
    try {
      instance = await workflow.create({
        params: {
          tenantId: entityId.tenantId,
          projectId: entityId.projectId,
          evaluationId: entityId.id,
          startedAtMs: Date.now(),
          userId: entityId.userId,
        },
      });
    } catch (error) {
      await this.repository.releaseWorkflowStart(entityId);
      throw error;
    }

    return await this.setWorkflowId(entityId, instance.id);
  }

  async getWorkflowStatus(
    evaluation: Evaluation,
    workflow: EvaluationWorkflowBinding
  ): Promise<string | null> {
    if (!evaluation.workflowId) {
      return null;
    }

    if (evaluation.workflowId === WORKFLOW_START_PENDING) {
      return "starting";
    }

    try {
      const instance = await workflow.get(evaluation.workflowId);
      return (await instance.status()).status;
    } catch {
      return "unknown";
    }
  }

  async getEvaluation(entityId: EntityId): Promise<Evaluation | undefined> {
    return await this.repository.findById(entityId);
  }

  async getEvaluationBySlug(projectId: ProjectId, slug: string): Promise<Evaluation | undefined> {
    return await this.repository.findBySlug(projectId, slug);
  }

  async setWorkflowId(
    entityId: EntityId,
    workflowId: string
  ): Promise<Evaluation> {
    const evaluation = await this.repository.updateWorkflowId(entityId, workflowId);

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }

    return evaluation;
  }

  async startEvaluation(entityId: EntityId): Promise<Evaluation> {
    const evaluation = await this.repository.markRunning(entityId);

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }

    return evaluation;
  }

  async failEvaluation(entityId: EntityId, durationMs: number, error: string): Promise<void> {
    const evaluation = await this.repository.markFailed(entityId, durationMs);
    if (!evaluation) {
      throw new Error("Evaluation not found");
    }
    await this.eventRepository.create(entityId, { type: "failed", details: { error, durationMs } });
  }

  async recordEvent(entityId: EntityId, event: NewEvaluationEvent): Promise<void> {
    await this.eventRepository.create(entityId, event);
  }

  async nextCallAttempt(entityId: EntityId, call: { recordId: number; versionId: number }): Promise<number> {
    return (await this.eventRepository.countCallStarts(entityId, call)) + 1;
  }

  async countCalls(entityId: EntityId, evaluation: Evaluation): Promise<number> {
    if (!evaluation.datasetId) {
      return 0;
    }
    const [records, prompts] = await Promise.all([
      this.recordRepository.countByDataSet(new EntityId(evaluation.datasetId, entityId.getProjectId())),
      this.promptRepository.listByEvaluation(entityId),
    ]);
    return records * prompts.length;
  }

  async getEvaluationActivity(entityId: EntityId): Promise<EvaluationActivity | undefined> {
    const evaluation = await this.repository.findById(entityId);
    if (!evaluation) {
      return undefined;
    }

    const [events, counts, totalCalls] = await Promise.all([
      this.eventRepository.listLatest(entityId, ACTIVITY_EVENT_LIMIT),
      this.eventRepository.countByType(entityId),
      this.countCalls(entityId, evaluation),
    ]);

    return {
      events,
      progress: {
        totalCalls,
        succeededCalls: counts.call_succeeded ?? 0,
        sentAttempts: counts.call_started ?? 0,
        failedAttempts: counts.call_failed ?? 0,
        lastEventAt: events[0]?.createdAt ?? null,
      },
    };
  }

  async finishEvaluation(
    entityId: EntityId,
    durationMs: number
  ): Promise<Evaluation> {
    const evaluation = await this.repository.markFinished(entityId, durationMs);

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }

    return evaluation;
  }

  async updateOutputSchema(
    entityId: EntityId,
    outputSchema: string
  ): Promise<Evaluation> {
    const evaluation = await this.repository.updateOutputSchema(entityId, outputSchema);

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }

    return evaluation;
  }

  async deleteEvaluation(entityId: EntityId): Promise<void> {
    const evaluation = await this.repository.delete(entityId);

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }
  }

  async getEvaluationDetails(
    entityId: EntityId
  ): Promise<{
    evaluation: Evaluation;
    prompts: { promptId: number; versionId: number; version: number; promptName: string; responseFormat: string | null }[];
    results: {
      recordId: number;
      variables: string;
      outputs: { promptId: number; versionId: number; result: string; durationMs: number | null }[];
    }[];
  } | null> {
    const evaluation = await this.repository.findById(entityId);

    if (!evaluation) {
      return null;
    }

    const evaluationPrompts = await this.promptRepository.listByEvaluation(entityId);

    // Fetch prompt names and response formats for each evaluation prompt
    const prompts = await Promise.all(
      evaluationPrompts.map(async (ep) => {
				const projectId = new ProjectId(entityId.projectId, entityId.tenantId, entityId.userId);
				const promptId = new EntityId(ep.promptId, projectId);
        const prompt = await this.promptRepo.findPromptById(promptId);
        const version = await this.promptRepo.findPromptVersionById(projectId, ep.versionId);

        // Extract response_format from the version body
        let responseFormat: string | null = null;
        if (version?.body) {
          try {
            const body = JSON.parse(version.body);
            if (body.response_format) {
              responseFormat = JSON.stringify(body.response_format);
            }
          } catch {
            // Ignore parse errors
          }
        }

        return {
          promptId: ep.promptId,
          versionId: ep.versionId,
          version: version?.version ?? 0,
          promptName: prompt?.name ?? `Prompt ${ep.promptId}`,
          responseFormat,
        };
      })
    );

    const results = await this.resultRepository.findByEvaluation({
      tenantId: entityId.tenantId,
      projectId: entityId.projectId,
      evaluationId: entityId.id,
    });

    // Group results by dataSetRecordId
    const resultsByRecord = new Map<
      number,
      { promptId: number; versionId: number; result: string; durationMs: number | null }[]
    >();

    for (const result of results) {
      const existing = resultsByRecord.get(result.dataSetRecordId) ?? [];
      existing.push({
        promptId: result.promptId,
        versionId: result.versionId,
        result: result.result,
        durationMs: result.durationMs,
      });
      resultsByRecord.set(result.dataSetRecordId, existing);
    }

    // Get unique record IDs and fetch their variables
    const recordIds = Array.from(resultsByRecord.keys());
    const recordsData: {
      recordId: number;
      variables: string;
      outputs: { promptId: number; versionId: number; result: string; durationMs: number | null }[];
    }[] = [];

    for (const recordId of recordIds) {
			const recordEntityId = new EntityId(recordId, entityId.getProjectId());
      const record = await this.recordRepository.findById(recordEntityId);

      if (record) {
        recordsData.push({
          recordId,
          variables: record.variables,
          outputs: resultsByRecord.get(recordId) ?? [],
        });
      }
    }

    return {
      evaluation,
      prompts,
      results: recordsData,
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .split(/[^a-z0-9]/)
      .filter(Boolean)
      .join("-");
  }
}
