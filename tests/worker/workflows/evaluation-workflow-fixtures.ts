import { env } from "cloudflare:test";
import { vi } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { runEvaluationWorkflow } from "../../../worker/workflows/evaluation.workflow";
import { evaluations } from "../../../worker/db/schema";
import { ProjectId } from "../../../worker/shared/project-id";
import { applyMigrations } from "../helpers/db-setup";
import { insertDataSetRecords, insertEvaluationPrompts, seedDataSet, seedProject, seedPrompt } from "../helpers/seed";

export type WorkflowPayload = Parameters<typeof runEvaluationWorkflow>[0];

export interface EvaluationFixture {
  payload: WorkflowPayload;
  promptId: number;
  versionId: number;
  recordIds: number[];
}

export const openAIResponse = (text: string) => ({
  id: "resp-1",
  model: "gpt-4o-mini-2024-07-18",
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
  usage: { input_tokens: 12, output_tokens: 4 },
});

export async function setupEvaluation(): Promise<EvaluationFixture> {
  await applyMigrations();

  const project = await seedProject(1, "supplements");
  const projectId = new ProjectId(project.id, 1, "user-1");
  const { prompt, versionIds } = await seedPrompt(projectId, "score-product");
  const dataSet = await seedDataSet(projectId, "supplement scoring");
  const records = await insertDataSetRecords([
    { tenantId: 1, projectId: project.id, dataSetId: dataSet.id, variables: JSON.stringify({ word: "zinc" }) },
    { tenantId: 1, projectId: project.id, dataSetId: dataSet.id, variables: JSON.stringify({ word: "iron" }) },
  ]);
  const [evaluation] = await drizzle(env.DB).insert(evaluations).values({
    tenantId: 1,
    projectId: project.id,
    datasetId: dataSet.id,
    name: "score check",
    slug: "score-check",
    type: "run",
    state: "created",
  }).returning();
  await insertEvaluationPrompts([
    { tenantId: 1, projectId: project.id, evaluationId: evaluation.id, promptId: prompt.id, versionId: versionIds[0] },
  ]);

  return {
    payload: { userId: "user-1", tenantId: 1, projectId: project.id, evaluationId: evaluation.id, startedAtMs: Date.now() },
    promptId: prompt.id,
    versionId: versionIds[0],
    recordIds: records.map((record) => record.id),
  };
}

export const runningStep = () =>
  ({
    do: vi.fn(async (_name: string, callback: () => Promise<unknown>) => await callback()),
    sleep: vi.fn(),
    sleepUntil: vi.fn(),
    waitForEvent: vi.fn(),
  }) as any;

export const retryingStep = (attempts: number) =>
  ({
    do: vi.fn(async (_name: string, callback: () => Promise<unknown>) => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await callback();
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    }),
    sleep: vi.fn(),
    sleepUntil: vi.fn(),
    waitForEvent: vi.fn(),
  }) as any;

export const runWorkflow = (
  payload: WorkflowPayload,
  options: { step?: ReturnType<typeof runningStep>; db?: D1Database; logFiles?: R2Bucket } = {}
) =>
  runEvaluationWorkflow(payload, options.step ?? runningStep(), {
    db: options.db ?? env.DB,
    cache: env.CACHE,
    logFiles: options.logFiles ?? env.PRIVATE_FILES,
    logQueue: env.NEW_LOGS,
    providerConfig: { openAIKey: "sk-test" },
  });
