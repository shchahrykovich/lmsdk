import type { ExecutionLogQueueMessage } from "./messages";
import { drizzle } from "drizzle-orm/d1";
import { ExecutionLogProcessingService } from "../services/execution-log-processing.service";
import { TraceExtractionService } from "../services/trace-extraction.service";
import { eq, and } from "drizzle-orm";
import { promptExecutionLogs } from "../db/schema";

/**
 * Queue consumer handler for processing execution log messages
 * This runs in the background after the HTTP response is sent
 */
export async function handler(
    batch: MessageBatch<ExecutionLogQueueMessage>,
    env: Env
): Promise<void> {
    console.log(`Processing ${batch.messages.length} execution log messages`);

    for (const message of batch.messages) {
        try {
            await processExecutionLog(message.body, env);

            // After processing the execution log, extract trace if traceId exists
            await processTraceExtraction(message.body, env);

            message.ack();
        } catch (error) {
            console.error(`Failed to process execution log ${message.body.logId}:`, error);
            message.retry();
        }
    }
}

/**
 * Process a single execution log message
 * Loads variables from R2, transforms them to path-value pairs,
 * and indexes them in the full-text search table
 */
async function processExecutionLog(
    log: ExecutionLogQueueMessage,
    env: Env
): Promise<void> {
    console.log(`Processing execution log ${log.logId} for tenant ${log.tenantId}`);

    const db = drizzle(env.DB);
    const service = new ExecutionLogProcessingService(db, env.PRIVATE_FILES, env.DB);

    await service.processExecutionLog(log.tenantId, log.projectId, log.logId);
}

/**
 * Extract and aggregate trace statistics
 * Runs after execution log processing if the log has a traceId
 */
async function processTraceExtraction(
    log: ExecutionLogQueueMessage,
    env: Env
): Promise<void> {
    const db = drizzle(env.DB);

    // Get the execution log to check if it has a traceId
    const [executionLog] = await db
        .select()
        .from(promptExecutionLogs)
        .where(
            and(
                eq(promptExecutionLogs.id, log.logId),
                eq(promptExecutionLogs.tenantId, log.tenantId),
                eq(promptExecutionLogs.projectId, log.projectId)
            )
        )
        .limit(1);

    if (!executionLog?.traceId) {
        console.log(`Execution log ${log.logId} has no traceId, skipping trace extraction`);
        return;
    }

    console.log(`Extracting trace ${executionLog.traceId} for tenant ${log.tenantId}`);

    const service = new TraceExtractionService(db, env.PRIVATE_FILES);
    await service.extractTrace(log.tenantId, log.projectId, executionLog.traceId);
}