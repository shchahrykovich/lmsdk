import { env } from "cloudflare:test";
import { vi } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { applyMigrations } from "../helpers/db-setup";
import { seedProject } from "../helpers/seed";
import { PromptService } from "../../../worker/prompts/prompt.service";
import { ProjectId } from "../../../worker/shared/project-id";
import { EntityId } from "../../../worker/shared/entity-id";
import { BatchService, type BatchServiceDeps, type BatchWorkflowParams } from "../../../worker/batches/batch.service";
import { BatchRunnerService, type BatchRunnerDeps } from "../../../worker/batches/batch-runner.service";
import { BatchFilesRepository } from "../../../worker/batches/batch-files.repository";
import { readLines } from "../../../worker/batches/streams";
import { renderExecuteRequest } from "../../../worker/execution/prompt-renderer";
import type { ExecuteRequest } from "../../../worker/providers/base-provider";
import type {
  BatchAdapter,
  BatchLimits,
  DownloadedFile,
  ItemOutcome,
  ParsedResultLine,
  ShardInput,
  ShardStatus,
  SubmittedShard,
} from "../../../worker/batches/adapters/batch-adapter";

export const PROMPT_BODY = {
  messages: [
    { role: "system", content: "Extract the protocol as JSON." },
    { role: "user", content: "{{article}}" },
  ],
  response_format: { type: "json" },
};

export interface BatchPrompt {
  projectId: ProjectId;
  promptId: EntityId<number>;
}

export async function setupBatchPrompt(
  options: { tenantId?: number; provider?: string; model?: string; slug?: string; body?: unknown } = {}
): Promise<BatchPrompt> {
  const tenantId = options.tenantId ?? 1;
  const project = await seedProject(tenantId, `supplements-${tenantId}`);
  const projectId = new ProjectId(project.id, tenantId, `user-${tenantId}`);
  const prompt = await new PromptService(drizzle(env.DB)).createPrompt(projectId, {
    name: "Extract protocol",
    slug: options.slug ?? "extract-protocol",
    provider: options.provider ?? "openai",
    model: options.model ?? "gpt-6-luna",
    body: JSON.stringify(options.body ?? PROMPT_BODY),
  });
  return { projectId, promptId: new EntityId(prompt.id, projectId) };
}

export async function resetDatabase(): Promise<void> {
  await applyMigrations();
}

type OutcomeFor = (request: { key: string; text: string }) => ItemOutcome | null;

export const succeededWith = (content: string, cost = 0.001): ItemOutcome => ({
  kind: "succeeded",
  result: {
    content,
    model: "gpt-6-luna-2026-09-01",
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost },
  },
});

export class FakeBatchAdapter implements BatchAdapter {
  readonly provider: string;
  readonly limits: BatchLimits;
  readonly submitted: { shardKey: string; lines: string[] }[] = [];
  readonly cancelled: string[] = [];
  pollsUntilDone = 1;
  shardOutcome: ShardStatus["outcome"] = "completed";
  submitError: Error | null = null;
  outcomeFor: OutcomeFor = ({ text }) => succeededWith(JSON.stringify({ echo: text }));
  private polls = new Map<string, number>();

  constructor(provider = "openai", limits: BatchLimits = { maxItems: 50_000, maxBytes: 190 * 1024 * 1024 }) {
    this.provider = provider;
    this.limits = limits;
  }

  encodeLine(key: string, request: ExecuteRequest): string {
    const rendered = renderExecuteRequest(request);
    return JSON.stringify({ key, text: rendered.messages.map((message) => message.content).join(" | ") });
  }

  async submit(shard: ShardInput): Promise<SubmittedShard> {
    if (this.submitError) throw this.submitError;
    const lines: string[] = [];
    for await (const line of readLines(shard.openBody())) lines.push(line);
    this.submitted.push({ shardKey: shard.shardKey, lines });
    return { providerBatchId: `fake_${this.submitted.length}` };
  }

  async poll(providerBatchId: string): Promise<ShardStatus> {
    const count = (this.polls.get(providerBatchId) ?? 0) + 1;
    this.polls.set(providerBatchId, count);
    const done = count >= this.pollsUntilDone;
    return {
      providerStatus: done ? "ended" : "in_progress",
      done,
      ...(done ? { outcome: this.cancelled.includes(providerBatchId) ? "cancelled" : this.shardOutcome } : {}),
      resultFiles: done ? [{ kind: "results", ref: providerBatchId }] : [],
    };
  }

  async download(file: { ref: string }): Promise<DownloadedFile> {
    const index = Number(file.ref.replace("fake_", "")) - 1;
    const lines = (this.submitted[index]?.lines ?? [])
      .map((line) => JSON.parse(line) as { key: string; text: string })
      .map((request) => ({ key: request.key, outcome: this.outcomeFor(request) }))
      .filter((entry) => entry.outcome !== null)
      .map((entry) => JSON.stringify(entry) + "\n")
      .join("");
    const bytes = new TextEncoder().encode(lines);
    return { body: new Blob([bytes]).stream(), length: bytes.byteLength };
  }

  parseResultLine(line: string): ParsedResultLine {
    return JSON.parse(line) as ParsedResultLine;
  }

  async cancel(providerBatchId: string): Promise<void> {
    this.cancelled.push(providerBatchId);
  }
}

export function createBatchService(adapter: BatchAdapter, now?: () => Date, extra: Partial<BatchServiceDeps> = {}) {
  const startWorkflow = vi.fn(async (_id: string, _params: BatchWorkflowParams) => undefined);
  const service = new BatchService({
    db: drizzle(env.DB),
    files: new BatchFilesRepository(env.PRIVATE_FILES),
    adapters: () => adapter,
    startWorkflow,
    ...(now ? { now } : {}),
    ...extra,
  });
  return { service, startWorkflow };
}

export function runnerDeps(adapter: BatchAdapter, extra: Partial<BatchRunnerDeps> = {}): BatchRunnerDeps {
  return {
    db: drizzle(env.DB),
    files: new BatchFilesRepository(env.PRIVATE_FILES),
    adapters: () => adapter,
    ...extra,
  };
}

export const workflowParams = (batchId: EntityId<number>): BatchWorkflowParams => ({
  tenantId: batchId.tenantId,
  projectId: batchId.projectId,
  userId: batchId.userId,
  batchId: batchId.id,
});

export const recordingStep = () => {
  const names: string[] = [];
  const step = {
    do: vi.fn(async (name: string, configOrCallback: unknown, maybeCallback?: () => Promise<unknown>) => {
      names.push(name);
      const callback = (typeof configOrCallback === "function" ? configOrCallback : maybeCallback) as () => Promise<unknown>;
      return await callback();
    }),
    sleep: vi.fn(async (name: string) => {
      names.push(name);
    }),
    sleepUntil: vi.fn(),
    waitForEvent: vi.fn(),
  };
  return { step: step as never, names };
};

export const itemsFor = (count: number, prefix = "article") =>
  Array.from({ length: count }, (_, index) => ({
    custom_id: `${prefix}-${index}`,
    variables: { article: `${prefix} text ${index}` },
  }));

export const runner = (adapter: BatchAdapter, extra: Partial<BatchRunnerDeps> = {}) =>
  new BatchRunnerService(runnerDeps(adapter, extra));
