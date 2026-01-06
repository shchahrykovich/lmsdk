import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { EvaluationService } from "../services/evaluation.service";
import { EvaluationPromptRepository } from "../repositories/evaluation-prompt.repository";
import { EvaluationResultRepository } from "../repositories/evaluation-result.repository";
import { DataSetRecordRepository } from "../repositories/dataset-record.repository";
import { PromptService } from "../services/prompt.service";
import { ProviderService } from "../services/provider.service";
import { NullPromptExecutionLogger } from "../providers/logger/null-prompt-execution-logger";
import type { AIMessage, ResponseFormat } from "../providers/base-provider";
import {drizzle} from "drizzle-orm/d1";

export interface EvaluationWorkflowParams {
  tenantId: number;
  projectId: number;
  evaluationId: number;
  startedAtMs: number;
}

// eslint-disable-next-line max-lines-per-function
export async function runEvaluationWorkflow(
  payload: EvaluationWorkflowParams,
  step: WorkflowStep,
  deps: {
    db: D1Database;
    cache: KVNamespace;
    providerConfig: {
      openAIKey: string;
      geminiKey: string;
      cloudflareAiGatewayToken: string;
      cloudflareAiGatewayBaseUrl: string;
    };
  }
): Promise<void> {
  console.log("[EvaluationWorkflow] Starting evaluation workflow", {
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    evaluationId: payload.evaluationId,
    startedAtMs: payload.startedAtMs,
  });

  await step.do("start-evaluation", async () => {
    console.log("[EvaluationWorkflow] Step: start-evaluation");
    const evaluationService = new EvaluationService(deps.db);
    await evaluationService.startEvaluation(
      {
        tenantId: payload.tenantId,
        projectId: payload.projectId,
      },
      payload.evaluationId
    );
    console.log("[EvaluationWorkflow] Evaluation started successfully");
  });

  const evaluationService = new EvaluationService(deps.db);
  const promptService = new PromptService(drizzle(deps.db));
  const promptRepository = new EvaluationPromptRepository(deps.db);
  const resultRepository = new EvaluationResultRepository(deps.db);
  const recordRepository = new DataSetRecordRepository(deps.db);
  const providerService = new ProviderService(
    deps.providerConfig,
    new NullPromptExecutionLogger(),
    deps.cache
  );

  // Get evaluation to retrieve datasetId
  const evaluation = await step.do("get-evaluation", async () => {
    console.log("[EvaluationWorkflow] Step: get-evaluation");
    const { EvaluationRepository } = await import("../repositories/evaluation.repository");
    const evalRepo = new EvaluationRepository(deps.db);
    const result = await evalRepo.findById({
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      evaluationId: payload.evaluationId,
    });
    console.log("[EvaluationWorkflow] Retrieved evaluation", {
      found: !!result,
      datasetId: result?.datasetId,
    });
    return result;
  });

  if (!evaluation) {
    console.error("[EvaluationWorkflow] Evaluation not found");
    throw new Error("Evaluation not found");
  }

  if (!evaluation.datasetId) {
    console.error("[EvaluationWorkflow] Evaluation does not have a dataset assigned");
    throw new Error("Evaluation does not have a dataset assigned");
  }

  const evaluationPrompts = await promptRepository.listByEvaluation({
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    evaluationId: payload.evaluationId,
  });

  console.log("[EvaluationWorkflow] Retrieved evaluation prompts", {
    count: evaluationPrompts.length,
    promptIds: evaluationPrompts.map((p) => p.promptId),
  });

  const outputSchema: { fields: Record<string, { type: string }> } = { fields: {} };
  let lastRecordId: number | undefined;
  let totalRecordsProcessed = 0;
  let totalExecutions = 0;

  while (true) {
    const records = await recordRepository.listBatchByDataSet({
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      dataSetId: evaluation.datasetId,
      limit: 10,
      afterId: lastRecordId,
    });

    console.log("[EvaluationWorkflow] Retrieved dataset records batch", {
      count: records.length,
      afterId: lastRecordId,
    });

    if (records.length === 0) {
      console.log("[EvaluationWorkflow] No more records to process");
      break;
    }

    totalRecordsProcessed += records.length;

    for (const record of records) {
      const variables = parseVariables(record.variables);
      console.log("[EvaluationWorkflow] Processing record", {
        recordId: record.id,
        variableKeys: Object.keys(variables),
      });

      for (const evaluationPrompt of evaluationPrompts) {
        totalExecutions++;
        console.log("[EvaluationWorkflow] Executing prompt for record", {
          recordId: record.id,
          promptId: evaluationPrompt.promptId,
          versionId: evaluationPrompt.versionId,
          executionNumber: totalExecutions,
        });

        await step.do(
          `execute-${record.id}-${evaluationPrompt.promptId}-${evaluationPrompt.versionId}`,
          async () => {
            console.log("[EvaluationWorkflow] Step: execute prompt", {
              recordId: record.id,
              promptId: evaluationPrompt.promptId,
              versionId: evaluationPrompt.versionId,
            });

            const version = await promptService.getPromptVersionById(
              payload.tenantId,
              payload.projectId,
              evaluationPrompt.versionId
            );

            if (!version) {
              console.error("[EvaluationWorkflow] Prompt version not found", {
                versionId: evaluationPrompt.versionId,
              });
              throw new Error("Prompt version not found");
            }

            console.log("[EvaluationWorkflow] Retrieved prompt version", {
              versionId: version.id,
              provider: version.provider,
              model: version.model,
              slug: version.slug,
            });

            const promptBody = parsePromptBody(version.body);
            if (!promptBody || promptBody.messages.length === 0) {
              console.error("[EvaluationWorkflow] Prompt body is missing messages");
              throw new Error("Prompt body is missing messages");
            }

            console.log("[EvaluationWorkflow] Parsed prompt body", {
              messageCount: promptBody.messages.length,
              hasResponseFormat: !!promptBody.response_format,
              proxy: promptBody.proxy,
            });

            console.log("[EvaluationWorkflow] Executing prompt with provider", {
              provider: version.provider,
              model: version.model,
            });

            const result = await providerService.executePrompt(version.provider, {
              model: version.model,
              messages: promptBody.messages,
              variables,
              response_format: promptBody.response_format,
              openai_settings: promptBody.openai_settings,
              google_settings: promptBody.google_settings,
              proxy: promptBody.proxy,
              projectId: version.projectId,
              promptSlug: version.slug,
            });

            console.log("[EvaluationWorkflow] Prompt execution completed", {
              model: result.model,
              durationMs: result.duration_ms,
              hasUsage: !!result.usage,
              contentLength: result.content.length,
            });

            const resultPayload = {
              content: result.content,
              model: result.model,
            };

            await resultRepository.create({
              tenantId: payload.tenantId,
              projectId: payload.projectId,
              evaluationId: payload.evaluationId,
              dataSetRecordId: record.id,
              promptId: evaluationPrompt.promptId,
              versionId: evaluationPrompt.versionId,
              result: JSON.stringify(resultPayload),
              durationMs: result.duration_ms ?? null,
              stats: JSON.stringify({ usage: result.usage }),
            });

            console.log("[EvaluationWorkflow] Saved evaluation result", {
              recordId: record.id,
              promptId: evaluationPrompt.promptId,
              versionId: evaluationPrompt.versionId,
            });

            mergeOutputSchema(outputSchema, result.content, promptBody.response_format);

            console.log("[EvaluationWorkflow] Merged output schema", {
              fieldCount: Object.keys(outputSchema.fields).length,
            });

            await evaluationService.updateOutputSchema(
              {
                tenantId: payload.tenantId,
                projectId: payload.projectId,
              },
              payload.evaluationId,
              JSON.stringify(outputSchema)
            );

            console.log("[EvaluationWorkflow] Updated output schema");
          }
        );
      }
    }

    lastRecordId = records[records.length - 1]?.id;
  }

  console.log("[EvaluationWorkflow] Completed all executions", {
    totalRecordsProcessed,
    totalExecutions,
    totalPrompts: evaluationPrompts.length,
  });

  await step.do("finish-evaluation", async () => {
    console.log("[EvaluationWorkflow] Step: finish-evaluation");
    const durationMs = Math.max(0, Date.now() - payload.startedAtMs);
    console.log("[EvaluationWorkflow] Finishing evaluation", {
      durationMs,
      durationSeconds: (durationMs / 1000).toFixed(2),
    });

    await evaluationService.finishEvaluation(
      {
        tenantId: payload.tenantId,
        projectId: payload.projectId,
      },
      payload.evaluationId,
      durationMs
    );

    console.log("[EvaluationWorkflow] Evaluation finished successfully");
  });

  console.log("[EvaluationWorkflow] Workflow completed", {
    evaluationId: payload.evaluationId,
    totalRecordsProcessed,
    totalExecutions,
  });
}

export class EvaluationWorkflow extends WorkflowEntrypoint<Env, EvaluationWorkflowParams> {
  async run(
    event: WorkflowEvent<EvaluationWorkflowParams>,
    step: WorkflowStep
  ): Promise<void> {
    await runEvaluationWorkflow(event.payload, step, {
      db: this.env.DB,
      cache: this.env.CACHE,
      providerConfig: {
        openAIKey: this.env.OPEN_AI_API_KEY,
        geminiKey: this.env.GEMINI_API_KEY,
        cloudflareAiGatewayToken: this.env.CLOUDFLARE_AI_GATEWAY_TOKEN,
        cloudflareAiGatewayBaseUrl: this.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
      },
    });
  }
}

type PromptBody = {
  messages?: AIMessage[];
  response_format?: ResponseFormat;
  openai_settings?: Record<string, unknown>;
  google_settings?: Record<string, unknown>;
  proxy?: "none" | "cloudflare";
};

const parsePromptBody = (
  rawBody: string
): (Required<Pick<PromptBody, "messages">> & PromptBody) | null => {
  if (!rawBody) return null;
  try {
    const parsed = JSON.parse(rawBody) as PromptBody;
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    return { ...parsed, messages };
  } catch {
    return null;
  }
};

const parseVariables = (rawVariables: string): Record<string, unknown> => {
  if (!rawVariables) return {};
  try {
    const parsed = JSON.parse(rawVariables) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const mergeOutputSchema = (
  schema: { fields: Record<string, { type: string }> },
  content: string,
  responseFormat?: ResponseFormat
) => {
  const parsed = parseOutputContent(content, responseFormat);
  if (!parsed) {
    mergeField(schema, "value", "string");
    return;
  }

  if (Array.isArray(parsed)) {
    mergeField(schema, "value", "array");
    return;
  }

  if (parsed && typeof parsed === "object") {
    for (const [key, value] of Object.entries(parsed)) {
      mergeField(schema, key, inferType(value));
    }
    return;
  }

  mergeField(schema, "value", inferType(parsed));
};

const parseOutputContent = (
  content: string,
  responseFormat?: ResponseFormat
): unknown => {
  if (responseFormat?.type === "json" || responseFormat?.type === "json_schema") {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return null;
};

const inferType = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const mergeField = (
  schema: { fields: Record<string, { type: string }> },
  key: string,
  type: string
) => {
  const existing = schema.fields[key];
  if (!existing) {
    schema.fields[key] = { type };
    return;
  }
  if (existing.type !== type && existing.type !== "mixed") {
    schema.fields[key] = { type: "mixed" };
  }
};
