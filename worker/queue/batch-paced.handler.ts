import { drizzle } from "drizzle-orm/d1";
import { BatchRunnerService, type PacedItemMessage } from "../batches/batch-runner.service";
import { BatchFilesRepository } from "../batches/batch-files.repository";
import { createBatchAdapterFactory } from "../batches/adapters/adapter-factory";
import { errorText } from "../batches/adapters/batch-adapter";
import { providerConfigFromEnv } from "../providers/provider-factory";

export const BATCH_PACED_QUEUE_MARKER = "batch-paced";
export const PACED_MAX_DELIVERIES = 8;

export const isPacedBatchQueue = (queueName: string): boolean => queueName.includes(BATCH_PACED_QUEUE_MARKER);

export async function handlePacedBatchMessages(batch: MessageBatch<PacedItemMessage>, env: Env): Promise<void> {
  const providerConfig = providerConfigFromEnv(env);
  const runner = new BatchRunnerService({
    db: drizzle(env.DB),
    files: new BatchFilesRepository(env.PRIVATE_FILES),
    adapters: createBatchAdapterFactory(providerConfig),
    providerConfig,
    cache: env.CACHE,
  });

  await Promise.all(
    batch.messages.map(async (message) => {
      try {
        const outcome = await runner.runPacedItem(message.body, message.attempts);
        if (outcome.done) {
          message.ack();
        } else {
          message.retry({ delaySeconds: outcome.retryAfterSeconds });
        }
      } catch (error) {
        console.error("[PacedBatch] Item failed before the provider call", { ...message.body, error: errorText(error) });
        if (message.attempts >= PACED_MAX_DELIVERIES) {
          await runner.failPacedItem(message.body, errorText(error));
          message.ack();
        } else {
          message.retry({ delaySeconds: 60 });
        }
      }
    })
  );
}
