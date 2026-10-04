import { env } from "cloudflare:test";

let sequence = 0;
const nextSlug = (prefix: string) => `${prefix}-${++sequence}`;

export const toEpochSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

export async function insertPrompt(tenantId: number, projectId: number, isActive = true): Promise<void> {
  const slug = nextSlug("prompt");
  await env.DB.prepare(
    "INSERT INTO Prompts (tenantId, projectId, latestVersion, name, provider, model, slug, isActive) VALUES (?, ?, 1, ?, 'openai', 'gpt-4o-mini', ?, ?)"
  ).bind(tenantId, projectId, slug, slug, isActive ? 1 : 0).run();
}

export async function insertLog(params: {
  tenantId: number;
  projectId: number;
  isSuccess: boolean;
  durationMs?: number | null;
  totalTokens?: number;
  cost?: number;
  createdAt?: Date;
}): Promise<void> {
  const usage =
    params.totalTokens === undefined
      ? null
      : JSON.stringify({ total_tokens: params.totalTokens, ...(params.cost === undefined ? {} : { cost: params.cost }) });
  const createdAt = toEpochSeconds(params.createdAt ?? new Date());
  await env.DB.prepare(
    "INSERT INTO PromptExecutionLogs (tenantId, projectId, promptId, version, isSuccess, durationMs, usage, createdAt) VALUES (?, ?, 1, 1, ?, ?, ?, ?)"
  ).bind(params.tenantId, params.projectId, params.isSuccess ? 1 : 0, params.durationMs ?? null, usage, createdAt).run();
}

export async function insertTrace(tenantId: number, projectId: number): Promise<void> {
  await env.DB.prepare("INSERT INTO Traces (tenantId, projectId, traceId) VALUES (?, ?, ?)")
    .bind(tenantId, projectId, nextSlug("trace"))
    .run();
}

export async function insertDataSet(
  tenantId: number,
  projectId: number,
  countOfRecords: number,
  isDeleted = false
): Promise<void> {
  const slug = nextSlug("dataset");
  await env.DB.prepare(
    "INSERT INTO DataSets (tenantId, projectId, name, slug, countOfRecords, isDeleted) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(tenantId, projectId, slug, slug, countOfRecords, isDeleted ? 1 : 0).run();
}

export async function insertEvaluation(tenantId: number, projectId: number): Promise<void> {
  const slug = nextSlug("evaluation");
  await env.DB.prepare(
    "INSERT INTO Evaluations (tenantId, projectId, name, slug, type, state) VALUES (?, ?, ?, ?, 'run', 'finished')"
  ).bind(tenantId, projectId, slug, slug).run();
}
