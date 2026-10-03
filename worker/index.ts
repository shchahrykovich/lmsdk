import {drizzle} from "drizzle-orm/d1";
import {createHonoApp} from "./routes/app";
import {handler} from "./queue/handler";
import {handlePacedBatchMessages, isPacedBatchQueue} from "./queue/batch-paced.handler";
import type {ExecutionLogQueueMessage} from "./queue/messages";
import type {PacedItemMessage} from "./batches/batch-runner.service";
import {BatchRetentionService} from "./batches/batch-retention.service";
import {BatchFilesRepository} from "./batches/batch-files.repository";
export {EvaluationWorkflow} from "./workflows/evaluation.workflow";
export {BatchWorkflow} from "./workflows/batch.workflow";

const honoApp = createHonoApp();

const app = {
	...honoApp,
	queue: async (batch: MessageBatch<unknown>, env: Env): Promise<void> => {
		if (isPacedBatchQueue(batch.queue)) {
			await handlePacedBatchMessages(batch as MessageBatch<PacedItemMessage>, env);
			return;
		}
		await handler(batch as MessageBatch<ExecutionLogQueueMessage>, env);
	},
	scheduled: async (_controller: ScheduledController, env: Env): Promise<void> => {
		const purged = await new BatchRetentionService(drizzle(env.DB), new BatchFilesRepository(env.PRIVATE_FILES)).purgeExpired();
		console.log(`[Retention] Deleted ${purged} expired batches`);
	},
}

export default app;
