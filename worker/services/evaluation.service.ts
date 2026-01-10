import { drizzle } from "drizzle-orm/d1";
import type { Evaluation } from "../db/schema";
import { EvaluationRepository } from "../repositories/evaluation.repository";
import { EvaluationPromptRepository } from "../repositories/evaluation-prompt.repository";
import { EvaluationResultRepository } from "../repositories/evaluation-result.repository";
import { DataSetRecordRepository } from "../repositories/dataset-record.repository";
import { DataSetRepository } from "../repositories/dataset.repository";
import { PromptRepository } from "../repositories/prompt.repository";
import type { TenantProjectContext } from "../types/common";

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
    context: TenantProjectContext
  ): Promise<
    (Evaluation & {
      datasetName: string | null;
      prompts: { promptId: number; versionId: number; promptName: string; version: number }[];
    })[]
  > {
    const evaluations = await this.repository.findByTenantAndProject(context);

    // Fetch dataset names and prompts for each evaluation
    const evaluationsWithDetails = await Promise.all(
      evaluations.map(async (evaluation) => {
        // Fetch dataset name
        let datasetName: string | null = null;
        if (evaluation.datasetId) {
          const dataset = await this.datasetRepository.findById({
            tenantId: context.tenantId,
            projectId: context.projectId,
            dataSetId: evaluation.datasetId,
          });
          datasetName = dataset?.name ?? null;
        }

        // Fetch prompts
        const evaluationPrompts = await this.promptRepository.listByEvaluation({
          tenantId: context.tenantId,
          projectId: context.projectId,
          evaluationId: evaluation.id,
        });

        const prompts = await Promise.all(
          evaluationPrompts.map(async (ep) => {
            const prompt = await this.promptRepo.findPromptById(
              context.tenantId,
              context.projectId,
              ep.promptId
            );
            const version = await this.promptRepo.findPromptVersionById(
              context.tenantId,
              context.projectId,
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

  async createEvaluation(
    context: TenantProjectContext,
    input: CreateEvaluationInput
  ): Promise<Evaluation> {
    const existingByName = await this.repository.findByName({
      tenantId: context.tenantId,
      projectId: context.projectId,
      name: input.name,
    });

    if (existingByName) {
      throw new Error("Evaluation name already exists");
    }

    const baseSlug = this.generateSlug(input.name);
    let slug = baseSlug;
    let attempt = 1;

    while (
      await this.repository.findBySlug({
        tenantId: context.tenantId,
        projectId: context.projectId,
        slug,
      })
    ) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const evaluation = await this.repository.create({
      tenantId: context.tenantId,
      projectId: context.projectId,
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
        tenantId: context.tenantId,
        projectId: context.projectId,
        evaluationId: evaluation.id,
        promptId: prompt.promptId,
        versionId: prompt.versionId,
      }))
    );

    return evaluation;
  }

  async setWorkflowId(
    context: TenantProjectContext,
    evaluationId: number,
    workflowId: string
  ): Promise<Evaluation> {
    const evaluation = await this.repository.updateWorkflowId({
      tenantId: context.tenantId,
      projectId: context.projectId,
      evaluationId,
      workflowId,
    });

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }

    return evaluation;
  }

  async startEvaluation(
    context: TenantProjectContext,
    evaluationId: number
  ): Promise<Evaluation> {
    const evaluation = await this.repository.markRunning({
      tenantId: context.tenantId,
      projectId: context.projectId,
      evaluationId,
    });

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }

    return evaluation;
  }

  async finishEvaluation(
    context: TenantProjectContext,
    evaluationId: number,
    durationMs: number
  ): Promise<Evaluation> {
    const evaluation = await this.repository.markFinished({
      tenantId: context.tenantId,
      projectId: context.projectId,
      evaluationId,
      durationMs,
    });

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }

    return evaluation;
  }

  async updateOutputSchema(
    context: TenantProjectContext,
    evaluationId: number,
    outputSchema: string
  ): Promise<Evaluation> {
    const evaluation = await this.repository.updateOutputSchema({
      tenantId: context.tenantId,
      projectId: context.projectId,
      evaluationId,
      outputSchema,
    });

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }

    return evaluation;
  }

  async deleteEvaluation(
    context: TenantProjectContext,
    evaluationId: number
  ): Promise<void> {
    const evaluation = await this.repository.delete({
      tenantId: context.tenantId,
      projectId: context.projectId,
      evaluationId,
    });

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }
  }

  async getEvaluationDetails(
    context: TenantProjectContext,
    evaluationId: number
  ): Promise<{
    evaluation: Evaluation;
    prompts: { promptId: number; versionId: number; version: number; promptName: string; responseFormat: string | null }[];
    results: {
      recordId: number;
      variables: string;
      outputs: { promptId: number; versionId: number; result: string; durationMs: number | null }[];
    }[];
  } | null> {
    const evaluation = await this.repository.findById({
      tenantId: context.tenantId,
      projectId: context.projectId,
      evaluationId,
    });

    if (!evaluation) {
      return null;
    }

    const evaluationPrompts = await this.promptRepository.listByEvaluation({
      tenantId: context.tenantId,
      projectId: context.projectId,
      evaluationId,
    });

    // Fetch prompt names and response formats for each evaluation prompt
    const prompts = await Promise.all(
      evaluationPrompts.map(async (ep) => {
        const prompt = await this.promptRepo.findPromptById(
          context.tenantId,
          context.projectId,
          ep.promptId
        );
        const version = await this.promptRepo.findPromptVersionById(
          context.tenantId,
          context.projectId,
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
      tenantId: context.tenantId,
      projectId: context.projectId,
      evaluationId,
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
        tenantId: context.tenantId,
        projectId: context.projectId,
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
