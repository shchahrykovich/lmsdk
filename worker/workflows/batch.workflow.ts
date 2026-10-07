import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { BatchRunnerService, type BatchRunnerDeps, type ShardSnapshot } from "../batches/batch-runner.service";
import { BatchFilesRepository } from "../batches/batch-files.repository";
import { createBatchAdapterFactory } from "../batches/adapters/adapter-factory";
import { errorText } from "../batches/adapters/batch-adapter";
import type { BatchWorkflowParams } from "../batches/batch.service";
import type { EntityId } from "../shared/entity-id";
import { providerConfigFromEnv } from "../providers/provider-factory";

const NATIVE_DELAYS_SECONDS = [30, 60, 120, 300, 600, 900];
const PACED_DELAYS_SECONDS = [15, 30, 60, 120];
const NO_RETRY = { retries: { limit: 0, delay: 1000 } };
const FAIL_BATCH_WAIT_MS = 60_000;

const delayFor = (delays: number[], iteration: number): number => delays[Math.min(iteration, delays.length - 1)]!;

export async function runBatchWorkflow(
  payload: BatchWorkflowParams,
  step: WorkflowStep,
  deps: BatchRunnerDeps
): Promise<void> {
  const runner = new BatchRunnerService(deps);
  const batchId = BatchRunnerService.batchId(payload);
  try {
    const snapshot = await step.do("load", () => runner.snapshot(batchId));
    if (snapshot.mode === "paced") {
      await runPaced(step, runner, batchId);
    } else {
      await runNative(step, runner, batchId);
    }
    await step.do("finish", () => runner.finish(batchId));
  } catch (error) {
    try {
      await step.sleep("fail-batch-wait", FAIL_BATCH_WAIT_MS);
      await step.do("fail-batch", () => runner.fail(batchId, errorText(error)));
    } catch (failError) {
      console.error("[BatchWorkflow] Could not mark the batch failed", { batchId: payload.batchId, error: errorText(failError) });
    }
    throw error;
  }
}

async function runNative(step: WorkflowStep, runner: BatchRunnerService, batchId: EntityId<number>): Promise<void> {
  await step.do("plan", () => runner.plan(batchId));
  for (let iteration = 0; ; iteration++) {
    const snapshot = await step.do(`snapshot-${iteration}`, () => runner.snapshot(batchId));
    if (snapshot.cancelRequested) {
      await step.do(`cancel-planned-${iteration}`, () => runner.cancelPlannedShards(batchId));
    } else {
      await submitPlanned(step, runner, batchId, snapshot.shards);
    }
    if (iteration === 0) {
      await step.do("mark-running", () => runner.markRunning(batchId));
    }
    await step.do(`poll-${iteration}`, () => runner.pollShards(batchId));
    const ended = await step.do(`ended-${iteration}`, () => runner.endedShardIds(batchId));
    for (const shardId of ended) {
      await importShard(step, runner, batchId, shardId);
    }
    if (await step.do(`check-${iteration}`, () => runner.allShardsTerminal(batchId))) {
      return;
    }
    await step.sleep(`wait-${iteration}`, delayFor(NATIVE_DELAYS_SECONDS, iteration) * 1000);
  }
}

async function submitPlanned(
  step: WorkflowStep,
  runner: BatchRunnerService,
  batchId: EntityId<number>,
  shards: ShardSnapshot[]
): Promise<void> {
  for (const shard of shards.filter((candidate) => candidate.state === "planned")) {
    const outcome = await step.do(`submit-${shard.seq}-${shard.submitAttempts}`, NO_RETRY, () =>
      runner.submitShard(batchId, shard.id)
    );
    if (outcome === "retry_later") return;
  }
}

async function importShard(
  step: WorkflowStep,
  runner: BatchRunnerService,
  batchId: EntityId<number>,
  shardId: number
): Promise<void> {
  const shard = (await step.do(`describe-${shardId}`, () => runner.snapshot(batchId))).shards.find(
    (candidate) => candidate.id === shardId
  );
  for (let fileIndex = 0; fileIndex < (shard?.resultFiles ?? 0); fileIndex++) {
    const size = await step.do(`copy-${shardId}-${fileIndex}`, () => runner.copyResultFile(batchId, shardId, fileIndex));
    let offset = 0;
    while (offset < size) {
      const from = offset;
      offset = await step.do(`import-${shardId}-${fileIndex}-${from}`, () =>
        runner.importRange(batchId, { shardId, fileIndex, offset: from, size })
      );
    }
  }
  await step.do(`finalize-${shardId}`, () => runner.finalizeShard(batchId, shardId));
}

async function runPaced(step: WorkflowStep, runner: BatchRunnerService, batchId: EntityId<number>): Promise<void> {
  let afterId = 0;
  for (let page = 0; ; page++) {
    const from = afterId;
    const next = await step.do(`enqueue-${page}`, () => runner.enqueuePaced(batchId, from));
    if (next === null) break;
    afterId = next;
  }
  await step.do("mark-running", () => runner.markRunning(batchId));
  for (let iteration = 0; ; iteration++) {
    await step.sleep(`wait-${iteration}`, delayFor(PACED_DELAYS_SECONDS, iteration) * 1000);
    if ((await step.do(`progress-${iteration}`, () => runner.pacedProgress(batchId))) === 0) {
      return;
    }
  }
}

export class BatchWorkflow extends WorkflowEntrypoint<Env, BatchWorkflowParams> {
  async run(event: WorkflowEvent<BatchWorkflowParams>, step: WorkflowStep): Promise<void> {
    const providerConfig = providerConfigFromEnv(this.env);
    await runBatchWorkflow(event.payload, step, {
      db: drizzle(this.env.DB),
      files: new BatchFilesRepository(this.env.PRIVATE_FILES),
      adapters: createBatchAdapterFactory(providerConfig),
      pacedQueue: this.env.BATCH_PACED,
      providerConfig,
      cache: this.env.CACHE,
    });
  }
}
