import { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, sql } from "drizzle-orm";
import { traces, promptExecutionLogs } from "../db/schema";

/**
 * Service for extracting and aggregating trace statistics
 * Handles distributed processing with optimistic locking
 */
export class TraceExtractionService {
  private db: DrizzleD1Database;
  private r2: R2Bucket;

  constructor(db: DrizzleD1Database, r2: R2Bucket) {
    this.db = db;
    this.r2 = r2;
  }

  /**
   * Extract and aggregate statistics for a trace
   * Uses optimistic locking to handle distributed processing
   *
   * @param tenantId - Tenant ID
   * @param projectId - Project ID
   * @param traceId - Trace ID to aggregate
   */
  async extractTrace(
    tenantId: number,
    projectId: number,
    traceId: string
  ): Promise<void> {
    if (!traceId) {
      console.warn("No traceId provided, skipping trace extraction");
      return;
    }

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        await this.processTrace(tenantId, projectId, traceId);
        return; // Success, exit
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          retryCount++;
          console.log(`Optimistic lock conflict for trace ${traceId}, retry ${retryCount}/${maxRetries}`);

          if (retryCount >= maxRetries) {
            console.error(`Failed to process trace ${traceId} after ${maxRetries} retries`);
            throw error;
          }

          // Brief delay before retry
          await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Process trace with optimistic locking
   */
  private async processTrace(
    tenantId: number,
    projectId: number,
    traceId: string
  ): Promise<void> {
    // Step 1: Read current trace record and capture updatedAt for optimistic locking
    const [existingTrace] = await this.db
      .select()
      .from(traces)
      .where(
        and(
          eq(traces.tenantId, tenantId),
          eq(traces.projectId, projectId),
          eq(traces.traceId, traceId)
        )
      )
      .limit(1);

    const initialUpdatedAt = existingTrace?.updatedAt;

    // Step 2: Query all execution logs for this trace
    const logs = await this.db
      .select()
      .from(promptExecutionLogs)
      .where(
        and(
          eq(promptExecutionLogs.tenantId, tenantId),
          eq(promptExecutionLogs.projectId, projectId),
          eq(promptExecutionLogs.traceId, traceId)
        )
      );

    if (logs.length === 0) {
      console.warn(`No logs found for trace ${traceId}`);
      return;
    }

    // Step 3: Calculate aggregated statistics
    const stats = this.calculateTraceStats(logs);

    // Step 4: Store detailed trace data to R2
    const tracePath = await this.storeTraceDataToR2(
      tenantId,
      projectId,
      traceId,
      logs,
      stats
    );

    // Step 5: Update or insert trace record with optimistic locking
    const now = Math.floor(Date.now() / 1000);
    const nowDate = new Date(now * 1000);

    if (existingTrace) {
      // Check if updatedAt has changed (another worker updated it)
      const [currentTrace] = await this.db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      if (!currentTrace) {
        throw new Error(`Trace record disappeared during processing: ${traceId}`);
      }

      // Compare updatedAt timestamps
      // Drizzle with mode: "timestamp" returns Date objects
      const currentUpdatedAt = currentTrace.updatedAt instanceof Date
        ? Math.floor(currentTrace.updatedAt.getTime() / 1000)
        : (currentTrace.updatedAt as number);

      const initialUpdatedAtTimestamp = initialUpdatedAt instanceof Date
        ? Math.floor(initialUpdatedAt.getTime() / 1000)
        : (initialUpdatedAt as number) || 0;

      if (currentUpdatedAt !== initialUpdatedAtTimestamp) {
        // Another worker updated this trace, restart process
        console.log(`Trace ${traceId} was updated by another worker, restarting`);
        throw new OptimisticLockError("Trace was modified during processing");
      }

      // Update existing trace
      await this.db
        .update(traces)
        .set({
          totalLogs: stats.totalLogs,
          successCount: stats.successCount,
          errorCount: stats.errorCount,
          totalDurationMs: stats.totalDurationMs,
          firstLogAt: stats.firstLogAt ? new Date(stats.firstLogAt * 1000) : undefined,
          lastLogAt: stats.lastLogAt ? new Date(stats.lastLogAt * 1000) : undefined,
          tracePath,
          updatedAt: nowDate,
        })
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId),
            // Add updatedAt to WHERE clause for atomic check-and-update
            sql`${traces.updatedAt} = ${initialUpdatedAtTimestamp}`
          )
        );

      // Verify update happened (if 0 rows affected, lock failed)
      const [verifyTrace] = await this.db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      const verifyUpdatedAt = verifyTrace.updatedAt instanceof Date
        ? Math.floor(verifyTrace.updatedAt.getTime() / 1000)
        : (verifyTrace.updatedAt as number);

      if (!verifyTrace || verifyUpdatedAt !== now) {
        throw new OptimisticLockError("Trace update failed due to concurrent modification");
      }
    } else {
      // Insert new trace record
      try {
        await this.db.insert(traces).values({
          tenantId,
          projectId,
          traceId,
          totalLogs: stats.totalLogs,
          successCount: stats.successCount,
          errorCount: stats.errorCount,
          totalDurationMs: stats.totalDurationMs,
          firstLogAt: stats.firstLogAt ? new Date(stats.firstLogAt * 1000) : undefined,
          lastLogAt: stats.lastLogAt ? new Date(stats.lastLogAt * 1000) : undefined,
          tracePath,
          updatedAt: nowDate,
        });
      } catch (error: any) {
        // Handle unique constraint violation (another worker inserted it)
        // D1 error format can have the constraint error nested deeply
        const checkError = (e: any): boolean => {
          if (!e) return false;
          const msg = e?.message || '';
          if (msg.includes("UNIQUE constraint failed") || msg.includes("SQLITE_CONSTRAINT")) {
            return true;
          }
          // Check nested cause
          if (e.cause) {
            return checkError(e.cause);
          }
          return false;
        };

        if (checkError(error)) {
          throw new OptimisticLockError("Trace was created by another worker");
        }
        throw error;
      }
    }

    console.log(`Successfully processed trace ${traceId} with ${stats.totalLogs} logs`);
  }

  /**
   * Calculate aggregated statistics from execution logs
   */
  private calculateTraceStats(logs: typeof promptExecutionLogs.$inferSelect[]) {
    let successCount = 0;
    let errorCount = 0;
    let totalDurationMs = 0;
    let firstLogAt: number | undefined;
    let lastLogAt: number | undefined;

    for (const log of logs) {
      if (log.isSuccess) {
        successCount++;
      } else {
        errorCount++;
      }

      if (log.durationMs) {
        totalDurationMs += log.durationMs;
      }

      // Drizzle with mode: "timestamp" returns Date objects
      const logTimestamp = log.createdAt instanceof Date
        ? Math.floor(log.createdAt.getTime() / 1000)
        : (log.createdAt as number);

      if (!firstLogAt || logTimestamp < firstLogAt) {
        firstLogAt = logTimestamp;
      }

      if (!lastLogAt || logTimestamp > lastLogAt) {
        lastLogAt = logTimestamp;
      }
    }

    return {
      totalLogs: logs.length,
      successCount,
      errorCount,
      totalDurationMs,
      firstLogAt,
      lastLogAt,
    };
  }

  /**
   * Store detailed trace data to R2
   * Returns the R2 path where the data was stored
   */
  private async storeTraceDataToR2(
    tenantId: number,
    projectId: number,
    traceId: string,
    logs: typeof promptExecutionLogs.$inferSelect[],
    stats: ReturnType<typeof this.calculateTraceStats>
  ): Promise<string> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const currentDay = `${year}-${month}-${day}`;

    const tracePath = `traces/${tenantId}/${currentDay}/${projectId}/${traceId}`;

    // Prepare trace aggregate data
    const traceData = {
      traceId,
      tenantId,
      projectId,
      stats,
      logs: logs.map(log => ({
        id: log.id,
        promptId: log.promptId,
        version: log.version,
        isSuccess: log.isSuccess,
        errorMessage: log.errorMessage,
        durationMs: log.durationMs,
        logPath: log.logPath,
        createdAt: typeof log.createdAt === 'number' ? log.createdAt : Math.floor(log.createdAt.getTime() / 1000),
      })),
      extractedAt: now.toISOString(),
    };

    // Store to R2
    await this.r2.put(
      `${tracePath}/trace.json`,
      JSON.stringify(traceData, null, 2),
      {
        httpMetadata: {
          contentType: 'application/json',
        },
      }
    );

    return tracePath;
  }
}

/**
 * Custom error for optimistic lock failures
 */
export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}
