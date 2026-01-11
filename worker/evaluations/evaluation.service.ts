import { drizzle } from "drizzle-orm/d1";
import type { Evaluation } from "../db/schema";
import { EvaluationRepository } from "./evaluation.repository";
import { EvaluationPromptRepository } from "../repositories/evaluation-prompt.repository";
import { EvaluationResultRepository } from "../repositories/evaluation-result.repository";
import { DataSetRecordRepository } from "../repositories/dataset-record.repository";
import { DataSetRepository } from "../repositories/dataset.repository";
import { PromptRepository } from "../repositories/prompt.repository";
import type { EntityId } from "../shared/entity-id";
import type { ProjectId } from "../shared/project-id";

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

export class EvaluationService {
  private repository: EvaluationRepository;
  private promptRepository: EvaluationPromptRepository;
  private resultRepository: EvaluationResultRepository;
  private recordRepository: DataSetRecordRepository;
  private datasetRepository: DataSetRepository;
  private promptRepo: PromptRepository;

  constructor(db: D1Database) {
    this.repository = new EvaluationRepository(db);
    this.promptRepository = new EvaluationPromptRepository(db);
    this.resultRepository = new EvaluationResultRepository(db);
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
          const dataset = await this.datasetRepository.findById({
            tenantId: projectId.tenantId,
            projectId: projectId.id,
            dataSetId: evaluation.datasetId,
          });
          datasetName = dataset?.name ?? null;
        }

        // Fetch prompts
        const evaluationPrompts = await this.promptRepository.listByEvaluation({
          tenantId: projectId.tenantId,
          projectId: projectId.id,
          evaluationId: evaluation.id,
        });

        const prompts = await Promise.all(
          evaluationPrompts.map(async (ep) => {
            const prompt = await this.promptRepo.findPromptById(
              projectId.tenantId,
              projectId.id,
              ep.promptId
            );
            const version = await this.promptRepo.findPromptVersionById(
              projectId.tenantId,
              projectId.id,
              ep.versionId
            );
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
          const dataset = await this.datasetRepository.findById({
            tenantId: projectId.tenantId,
            projectId: projectId.id,
            dataSetId: evaluation.datasetId,
          });
          datasetName = dataset?.name ?? null;
        }

        // Fetch prompts
        const evaluationPrompts = await this.promptRepository.listByEvaluation({
          tenantId: projectId.tenantId,
          projectId: projectId.id,
          evaluationId: evaluation.id,
        });

        const prompts = await Promise.all(
          evaluationPrompts.map(async (ep) => {
            const prompt = await this.promptRepo.findPromptById(
              projectId.tenantId,
              projectId.id,
              ep.promptId
            );
            const version = await this.promptRepo.findPromptVersionById(
              projectId.tenantId,
              projectId.id,
              ep.versionId
            );
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

  async createEvaluation(
    projectId: ProjectId,
    input: CreateEvaluationInput
  ): Promise<Evaluation> {
    const existingByName = await this.repository.findByName(projectId, input.name);

    if (existingByName) {
      throw new Error("Evaluation name already exists");
    }

    const baseSlug = this.generateSlug(input.name);
    let slug = baseSlug;
    let attempt = 1;

    while (await this.repository.findBySlug(projectId, slug)) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const evaluation = await this.repository.create({
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
    });

    await this.promptRepository.createMany(
      input.prompts.map((prompt) => ({
        tenantId: projectId.tenantId,
        projectId: projectId.id,
        evaluationId: evaluation.id,
        promptId: prompt.promptId,
        versionId: prompt.versionId,
      }))
    );

    return evaluation;
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

    const evaluationPrompts = await this.promptRepository.listByEvaluation({
      tenantId: entityId.tenantId,
      projectId: entityId.projectId,
      evaluationId: entityId.id,
    });

    // Fetch prompt names and response formats for each evaluation prompt
    const prompts = await Promise.all(
      evaluationPrompts.map(async (ep) => {
        const prompt = await this.promptRepo.findPromptById(
          entityId.tenantId,
          entityId.projectId,
          ep.promptId
        );
        const version = await this.promptRepo.findPromptVersionById(
          entityId.tenantId,
          entityId.projectId,
          ep.versionId
        );

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
      const record = await this.recordRepository.findById({
        tenantId: entityId.tenantId,
        projectId: entityId.projectId,
        recordId,
      });

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
