import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { EvaluationService } from "../evaluations/evaluation.service";
import { EvaluationPromptRepository } from "../evaluations/repositories/evaluation-prompt.repository";
import { EvaluationResultRepository } from "../evaluations/repositories/evaluation-result.repository";
import { DataSetRecordRepository } from "../datasets/dataset-record.repository";
import { PromptService } from "../prompts/prompt.service";
import { ProviderService } from "../services/provider.service";
import { CFPromptExecutionLogger } from "../providers/logger/c-f-prompt-execution-logger";
import type { PromptExecutionContext } from "../providers/logger/execution-logger";
import { providerConfigFromEnv, type ProviderConfig } from "../providers/provider-factory";
import type { ExecuteRequest, ExecuteResult, ResponseFormat } from "../providers/base-provider";
import { parsePromptBody } from "../execution/prompt-body";
import { buildExecuteRequest } from "../execution/prompt-renderer";
import {drizzle} from "drizzle-orm/d1";
import {EntityId} from "../shared/entity-id";
import {ProjectId} from "../shared/project-id";
import { runWithConcurrency } from "../shared/run-with-concurrency";

const EVALUATION_CONCURRENCY = 10;
const RECORD_BATCH_SIZE = 10;

export interface EvaluationWorkflowDeps {
  db: D1Database;
  cache: KVNamespace;
  logFiles: R2Bucket;
  logQueue: Queue;
  providerConfig: ProviderConfig;
}

export interface EvaluationWorkflowParams {
  userId: string;
  tenantId: number;
  projectId: number;
  evaluationId: number;
  startedAtMs: number;
}

export async function runEvaluationWorkflow(
  payload: EvaluationWorkflowParams,
  step: WorkflowStep,
  deps: EvaluationWorkflowDeps
): Promise<void> {
  try {
    await runEvaluationSteps(payload, step, deps);
  } catch (error) {
    await markEvaluationFailed(payload, step, deps, error);
    throw error;
  }
}

async function markEvaluationFailed(
  payload: EvaluationWorkflowParams,
  step: WorkflowStep,
  deps: EvaluationWorkflowDeps,
  failure: unknown
): Promise<void> {
  try {
    await step.do("fail-evaluation", async () => {
      const entityId = new EntityId(payload.evaluationId, new ProjectId(payload.projectId, payload.tenantId, payload.userId));
      const durationMs = Math.max(0, Date.now() - payload.startedAtMs);
      await new EvaluationService(deps.db).failEvaluation(entityId, durationMs, errorMessageOf(failure));
    });
  } catch (error) {
    console.error("[EvaluationWorkflow] Failed to mark the evaluation failed", { evaluationId: payload.evaluationId, error });
  }
}

// eslint-disable-next-line max-lines-per-function
async function runEvaluationSteps(
  payload: EvaluationWorkflowParams,
  step: WorkflowStep,
  deps: EvaluationWorkflowDeps
): Promise<void> {
  console.log("[EvaluationWorkflow] Starting evaluation workflow", {
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    evaluationId: payload.evaluationId,
    startedAtMs: payload.startedAtMs,
  });

	const projectId = new ProjectId(payload.projectId, payload.tenantId, payload.userId);
	const evaluationId = new EntityId(payload.evaluationId, projectId);

  await step.do("start-evaluation", async () => {
    console.log("[EvaluationWorkflow] Step: start-evaluation");
    const evaluationService = new EvaluationService(deps.db);
		const projectId = new ProjectId(payload.projectId, payload.tenantId, payload.userId);
		const entityId = new EntityId(payload.evaluationId, projectId);
    const started = await evaluationService.startEvaluation(entityId);
    await recordEventSafely(async () => {
      const totalCalls = await evaluationService.countCalls(entityId, started);
      await evaluationService.recordEvent(entityId, { type: "started", details: { totalCalls } });
    });
    console.log("[EvaluationWorkflow] Evaluation started successfully");
  });

  const evaluationService = new EvaluationService(deps.db);
  const promptService = new PromptService(drizzle(deps.db));
  const promptRepository = new EvaluationPromptRepository(deps.db);
  const resultRepository = new EvaluationResultRepository(deps.db);
  const recordRepository = new DataSetRecordRepository(deps.db);

  // Get evaluation to retrieve datasetId
  const evaluation = await step.do("get-evaluation", async () => {
    console.log("[EvaluationWorkflow] Step: get-evaluation");
    const { EvaluationRepository } = await import("../evaluations/repositories/evaluation.repository");
    const evalRepo = new EvaluationRepository(deps.db);

		const projectId = new ProjectId(payload.projectId, payload.tenantId, payload.userId);
    const result = await evalRepo.findById(new EntityId(payload.evaluationId, projectId));
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

  const evaluationPrompts = await promptRepository.listByEvaluation(evaluationId);

  console.log("[EvaluationWorkflow] Retrieved evaluation prompts", {
    count: evaluationPrompts.length,
    promptIds: evaluationPrompts.map((p) => p.promptId),
  });

  const { baseEvaluationId, datasetId } = evaluation;
  if (baseEvaluationId) {
    await step.do("reuse-base-results", async () => {
      const reused = await evaluationService.reuseBaseResults(evaluationId, baseEvaluationId, datasetId);
      console.log("[EvaluationWorkflow] Reused results from the base evaluation", { baseEvaluationId, reused });
    });
  }

  const outputSchema: OutputSchema = { fields: {} };
  const datasetEntityId = new EntityId(datasetId, projectId);
  let totalRecordsProcessed = 0;
  let totalExecutions = 0;

  async function* plannedCalls(): AsyncGenerator<PlannedCall> {
    let lastRecordId: number | undefined;
    while (true) {
      const records = await recordRepository.listBatchByDataSet(datasetEntityId, RECORD_BATCH_SIZE, lastRecordId);
      console.log("[EvaluationWorkflow] Retrieved dataset records batch", { count: records.length, afterId: lastRecordId });
      if (records.length === 0) return;

      totalRecordsProcessed += records.length;
      const stored = baseEvaluationId
        ? await step.do(`stored-results-after-${lastRecordId ?? 0}`, async () =>
            await describeStoredResults(promptService, resultRepository, evaluationId, records.map((record) => record.id))
          )
        : [];
      const storedKeys = new Set(stored.map((item) => callKey(item.recordId, item.versionId)));
      for (const item of stored) {
        mergeFields(outputSchema, item.fields);
      }

      yield* callsToRun(records, evaluationPrompts, storedKeys);
      lastRecordId = records[records.length - 1]?.id;
    }
  }

  await runWithConcurrency(plannedCalls(), EVALUATION_CONCURRENCY, async (planned) => {
    totalExecutions++;
    const fields = await step.do(
      `execute-${planned.recordId}-${planned.promptId}-${planned.versionId}`,
      async () => await executeCall(deps, payload, { promptService, evaluationService, resultRepository, evaluationId }, planned)
    );
    mergeFields(outputSchema, fields);
  });

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

		const projectId = new ProjectId(payload.projectId, payload.tenantId, payload.userId);
		const entityId = new EntityId(payload.evaluationId, projectId);
    await evaluationService.updateOutputSchema(entityId, JSON.stringify(outputSchema));
    await evaluationService.finishEvaluation(
			entityId,
      durationMs
    );
    await recordEventSafely(() => evaluationService.recordEvent(entityId, { type: "finished", details: { durationMs } }));

    console.log("[EvaluationWorkflow] Evaluation finished successfully");
  });

  console.log("[EvaluationWorkflow] Workflow completed", {
    evaluationId: payload.evaluationId,
    totalRecordsProcessed,
    totalExecutions,
  });
}

interface PlannedCall {
  recordId: number;
  variables: Record<string, unknown>;
  promptId: number;
  versionId: number;
}

interface CallServices {
  promptService: PromptService;
  evaluationService: EvaluationService;
  resultRepository: EvaluationResultRepository;
  evaluationId: EntityId;
}

type OutputFields = Record<string, string>;

interface StoredCallFields {
  recordId: number;
  versionId: number;
  fields: OutputFields;
}

const callKey = (recordId: number, versionId: number): string => `${recordId}:${versionId}`;

const callsToRun = (
  records: { id: number; variables: string }[],
  evaluationPrompts: { promptId: number; versionId: number }[],
  storedKeys: Set<string>
): PlannedCall[] =>
  records.flatMap((record) => {
    const variables = parseVariables(record.variables);
    return evaluationPrompts
      .filter((prompt) => !storedKeys.has(callKey(record.id, prompt.versionId)))
      .map((prompt) => ({ recordId: record.id, variables, promptId: prompt.promptId, versionId: prompt.versionId }));
  });

async function loadPromptBody(promptService: PromptService, projectId: ProjectId, versionId: number) {
  const version = await promptService.getPromptVersionById(projectId, versionId);
  if (!version) {
    console.error("[EvaluationWorkflow] Prompt version not found", { versionId });
    throw new Error("Prompt version not found");
  }
  const promptBody = parsePromptBody(version.body);
  if (!promptBody || promptBody.messages.length === 0) {
    console.error("[EvaluationWorkflow] Prompt body is missing messages");
    throw new Error("Prompt body is missing messages");
  }
  return { version, promptBody };
}

async function executeCall(
  deps: EvaluationWorkflowDeps,
  payload: EvaluationWorkflowParams,
  { promptService, evaluationService, resultRepository, evaluationId }: CallServices,
  planned: PlannedCall
): Promise<OutputFields> {
  const { version, promptBody } = await loadPromptBody(promptService, evaluationId.getProjectId(), planned.versionId);

  const call = { recordId: planned.recordId, promptId: planned.promptId, versionId: planned.versionId };
  const attempt = await nextAttemptSafely(evaluationService, evaluationId, call);
  await recordEventSafely(() => evaluationService.recordEvent(evaluationId, {
    type: "call_started",
    ...call,
    details: { attempt, provider: version.provider, model: version.model },
  }));

  const logContext = {
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    promptId: planned.promptId,
    version: version.version,
  };
  const result = await runCallWithEvents({ evaluationService, evaluationId, call, attempt }, () =>
    executePromptWithLog(deps, logContext, version.provider, buildExecuteRequest(version, promptBody, planned.variables))
  );

  await resultRepository.create({
    tenantId: payload.tenantId,
    projectId: payload.projectId,
    evaluationId: payload.evaluationId,
    dataSetRecordId: planned.recordId,
    promptId: planned.promptId,
    versionId: planned.versionId,
    result: JSON.stringify({ content: result.content, model: result.model }),
    durationMs: result.duration_ms ?? null,
    stats: JSON.stringify({ usage: result.usage }),
  });

  console.log("[EvaluationWorkflow] Saved evaluation result", { ...call, durationMs: result.duration_ms });
  return outputFields(result.content, promptBody.response_format);
}

async function describeStoredResults(
  promptService: PromptService,
  resultRepository: EvaluationResultRepository,
  evaluationId: EntityId,
  recordIds: number[]
): Promise<StoredCallFields[]> {
  const stored = await resultRepository.listForRecords(evaluationId, recordIds);
  const responseFormats = new Map<number, ResponseFormat | undefined>();
  for (const versionId of new Set(stored.map((item) => item.versionId))) {
    const { promptBody } = await loadPromptBody(promptService, evaluationId.getProjectId(), versionId);
    responseFormats.set(versionId, promptBody.response_format);
  }
  return stored.map((item) => ({
    recordId: item.dataSetRecordId,
    versionId: item.versionId,
    fields: outputFields(storedContent(item.result), responseFormats.get(item.versionId)),
  }));
}

const storedContent = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw) as { content?: unknown } | null;
    return typeof parsed?.content === "string" ? parsed.content : "";
  } catch {
    return "";
  }
};

export class EvaluationWorkflow extends WorkflowEntrypoint<Env, EvaluationWorkflowParams> {
  async run(
    event: WorkflowEvent<EvaluationWorkflowParams>,
    step: WorkflowStep
  ): Promise<void> {
    await runEvaluationWorkflow(event.payload, step, {
      db: this.env.DB,
      cache: this.env.CACHE,
      logFiles: this.env.PRIVATE_FILES,
      logQueue: this.env.NEW_LOGS,
      providerConfig: providerConfigFromEnv(this.env),
    });
  }
}

interface EvaluationCall {
  recordId: number;
  promptId: number;
  versionId: number;
}

interface TrackedCall {
  evaluationService: EvaluationService;
  evaluationId: EntityId;
  call: EvaluationCall;
  attempt: number | undefined;
}

async function runCallWithEvents(
  { evaluationService, evaluationId, call, attempt }: TrackedCall,
  execute: () => Promise<ExecuteResult>
): Promise<ExecuteResult> {
  let result: ExecuteResult;
  try {
    result = await execute();
  } catch (error) {
    await recordEventSafely(() => evaluationService.recordEvent(evaluationId, {
      type: "call_failed",
      ...call,
      details: { attempt, error: errorMessageOf(error) },
    }));
    throw error;
  }

  await recordEventSafely(() => evaluationService.recordEvent(evaluationId, {
    type: "call_succeeded",
    ...call,
    details: { attempt, durationMs: result.duration_ms },
  }));
  return result;
}

async function recordEventSafely(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error("[EvaluationWorkflow] Failed to save an activity event", { error });
  }
}

async function nextAttemptSafely(
  evaluationService: EvaluationService,
  evaluationId: EntityId,
  call: EvaluationCall
): Promise<number | undefined> {
  try {
    return await evaluationService.nextCallAttempt(evaluationId, call);
  } catch (error) {
    console.error("[EvaluationWorkflow] Failed to count earlier attempts", { error });
    return undefined;
  }
}

const errorMessageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function executePromptWithLog(
  deps: EvaluationWorkflowDeps,
  logContext: PromptExecutionContext,
  provider: string,
  request: ExecuteRequest
): Promise<ExecuteResult> {
  const logger = new CFPromptExecutionLogger(drizzle(deps.db), deps.logFiles, deps.logQueue);
  logger.setContext(logContext);
  const providerService = new ProviderService(deps.providerConfig, logger, deps.cache);

  try {
    return await providerService.executePrompt(provider, request);
  } finally {
    await logger.finish().catch((error: unknown) => {
      console.error("[EvaluationWorkflow] Failed to save the execution log", { ...logContext, error });
    });
  }
}

const parseVariables = (rawVariables: string): Record<string, unknown> => {
  if (!rawVariables) return {};
  try {
    const parsed = JSON.parse(rawVariables) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

interface OutputSchema {
  fields: Record<string, { type: string }>;
}

const outputFields = (content: string, responseFormat?: ResponseFormat): OutputFields => {
  const parsed = parseOutputContent(content, responseFormat);
  if (!parsed) {
    return { value: "string" };
  }

  if (Array.isArray(parsed)) {
    return { value: "array" };
  }

  if (typeof parsed === "object") {
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, inferType(value)]));
  }

  return { value: inferType(parsed) };
};

const mergeFields = (schema: OutputSchema, fields: OutputFields) => {
  for (const [key, type] of Object.entries(fields)) {
    mergeField(schema, key, type);
  }
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
  schema: OutputSchema,
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
