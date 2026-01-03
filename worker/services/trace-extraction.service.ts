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
    const existingTrace = await this.getTraceRecord(tenantId, projectId, traceId);
    const initialUpdatedAt = existingTrace?.updatedAt;
    const logs = await this.getTraceLogs(tenantId, projectId, traceId);

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
      await this.updateTraceWithOptimisticLock({
        tenantId,
        projectId,
        traceId,
        initialUpdatedAt,
        stats,
        tracePath,
        now,
        nowDate,
      });
    } else {
      await this.insertTraceRecord({
        tenantId,
        projectId,
        traceId,
        stats,
        tracePath,
        nowDate,
      });
    }

    console.log(`Successfully processed trace ${traceId} with ${stats.totalLogs} logs`);
  }

  private async getTraceRecord(tenantId: number, projectId: number, traceId: string) {
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

    return existingTrace;
  }

  private async getTraceLogs(tenantId: number, projectId: number, traceId: string) {
    return this.db
      .select()
      .from(promptExecutionLogs)
      .where(
        and(
          eq(promptExecutionLogs.tenantId, tenantId),
          eq(promptExecutionLogs.projectId, projectId),
          eq(promptExecutionLogs.traceId, traceId)
        )
      );
  }

  private async updateTraceWithOptimisticLock(params: {
    tenantId: number;
    projectId: number;
    traceId: string;
    initialUpdatedAt: number | Date | null | undefined;
    stats: ReturnType<TraceExtractionService["calculateTraceStats"]>;
    tracePath: string;
    now: number;
    nowDate: Date;
  }): Promise<void> {
    const { tenantId, projectId, traceId, initialUpdatedAt, stats, tracePath, now, nowDate } = params;
    const currentTrace = await this.getTraceRecord(tenantId, projectId, traceId);

    if (!currentTrace) {
      throw new Error(`Trace record disappeared during processing: ${traceId}`);
    }

    const currentUpdatedAt = this.getUpdatedAtTimestamp(currentTrace.updatedAt);
    const initialUpdatedAtTimestamp = this.getUpdatedAtTimestamp(initialUpdatedAt);

    if (currentUpdatedAt !== initialUpdatedAtTimestamp) {
      console.log(`Trace ${traceId} was updated by another worker, restarting`);
      throw new OptimisticLockError("Trace was modified during processing");
    }

    await this.db
      .update(traces)
      .set({
        totalLogs: stats.totalLogs,
        successCount: stats.successCount,
        errorCount: stats.errorCount,
        totalDurationMs: stats.totalDurationMs,
        stats: stats.stats,
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
          sql`${traces.updatedAt} = ${initialUpdatedAtTimestamp}`
        )
      );

    const verifyTrace = await this.getTraceRecord(tenantId, projectId, traceId);
    if (!verifyTrace) {
      throw new OptimisticLockError("Trace update failed due to concurrent modification");
    }

    const verifyUpdatedAt = this.getUpdatedAtTimestamp(verifyTrace.updatedAt);
    if (verifyUpdatedAt !== now) {
      throw new OptimisticLockError("Trace update failed due to concurrent modification");
    }
  }

  private async insertTraceRecord(params: {
    tenantId: number;
    projectId: number;
    traceId: string;
    stats: ReturnType<TraceExtractionService["calculateTraceStats"]>;
    tracePath: string;
    nowDate: Date;
  }): Promise<void> {
    const { tenantId, projectId, traceId, stats, tracePath, nowDate } = params;

    try {
      await this.db.insert(traces).values({
        tenantId,
        projectId,
        traceId,
        totalLogs: stats.totalLogs,
        successCount: stats.successCount,
        errorCount: stats.errorCount,
        totalDurationMs: stats.totalDurationMs,
        stats: stats.stats,
        firstLogAt: stats.firstLogAt ? new Date(stats.firstLogAt * 1000) : undefined,
        lastLogAt: stats.lastLogAt ? new Date(stats.lastLogAt * 1000) : undefined,
        tracePath,
        updatedAt: nowDate,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new OptimisticLockError("Trace was created by another worker");
      }
      throw error;
    }
  }

  private getUpdatedAtTimestamp(updatedAt: number | Date | null | undefined): number {
    if (updatedAt instanceof Date) {
      return Math.floor(updatedAt.getTime() / 1000);
    }
    if (typeof updatedAt === "number") {
      return updatedAt;
    }
    return 0;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const message = (error as { message?: string }).message || "";
    if (message.includes("UNIQUE constraint failed") || message.includes("SQLITE_CONSTRAINT")) {
      return true;
    }

    const cause = (error as { cause?: unknown }).cause;
    if (cause) {
      return this.isUniqueConstraintError(cause);
    }

    return false;
  }

  /**
   * Calculate aggregated statistics from execution logs
   * Includes usage statistics aggregated by provider and model
   */
  private calculateTraceStats(logs: typeof promptExecutionLogs.$inferSelect[]) {
    let successCount = 0;
    let errorCount = 0;
    let totalDurationMs = 0;
    let firstLogAt: number | undefined;
    let lastLogAt: number | undefined;

    // Aggregate usage by provider and model
    const providerStats = new Map<string, Map<string, { count: number; usage: any }>>();

    for (const log of logs) {
      if (log.isSuccess) {
        successCount++;
      } else {
        errorCount++;
      }

      if (log.durationMs) {
        totalDurationMs += log.durationMs;
      }

      // Aggregate usage statistics
      if (log.provider && log.model && log.usage) {
        try {
          const usage = JSON.parse(log.usage);

          if (!providerStats.has(log.provider)) {
            providerStats.set(log.provider, new Map());
          }

          const modelStats = providerStats.get(log.provider)!;

          if (!modelStats.has(log.model)) {
            modelStats.set(log.model, { count: 0, usage: this.initializeUsage(log.provider) });
          }

          const stats = modelStats.get(log.model)!;
          stats.count++;
          this.aggregateUsage(stats.usage, usage, log.provider);
        } catch (error) {
          console.error(`Failed to parse usage for log ${log.id}:`, error);
        }
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

    // Build stats JSON
    const statsJson = this.buildStatsJson(providerStats);

    return {
      totalLogs: logs.length,
      successCount,
      errorCount,
      totalDurationMs,
      firstLogAt,
      lastLogAt,
      stats: statsJson,
    };
  }

  /**
   * Initialize usage object based on provider
   */
  private initializeUsage(provider: string): any {
    if (provider === 'openai') {
      return {
        input_tokens: 0,
        cached_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: 0,
      };
    } else if (provider === 'google') {
      return {
        prompt_tokens: 0,
        cached_tokens: 0,
        response_tokens: 0,
        thoughts_tokens: 0,
        tool_use_prompt_tokens: 0,
        total_tokens: 0,
      };
    }
    return {};
  }

  /**
   * Aggregate usage from a single log into the accumulated stats
   */
  private aggregateUsage(accumulated: any, usage: any, provider: string): void {
    if (provider === 'openai') {
      accumulated.input_tokens += usage.input_tokens || 0;
      accumulated.cached_tokens += usage.input_tokens_details?.cached_tokens || 0;
      accumulated.output_tokens += usage.output_tokens || 0;
      accumulated.reasoning_tokens += usage.output_tokens_details?.reasoning_tokens || 0;
      accumulated.total_tokens += usage.total_tokens || 0;
    } else if (provider === 'google') {
      accumulated.prompt_tokens += usage.prompt_tokens || 0;
      accumulated.cached_tokens += usage.cached_tokens || 0;
      accumulated.response_tokens += usage.response_tokens || 0;
      accumulated.thoughts_tokens += usage.thoughts_tokens || 0;
      accumulated.tool_use_prompt_tokens += usage.tool_use_prompt_tokens || 0;
      accumulated.total_tokens += usage.total_tokens || 0;
    }
  }

  /**
   * Build stats JSON from aggregated provider statistics
   */
  private buildStatsJson(providerStats: Map<string, Map<string, { count: number; usage: any }>>): string | null {
    if (providerStats.size === 0) {
      return null;
    }

    const providers = [];
    for (const [provider, modelStats] of providerStats) {
      const models = [];
      for (const [model, stats] of modelStats) {
        models.push({
          model,
          count: stats.count,
          tokens: stats.usage,
        });
      }
      providers.push({
        provider,
        models,
      });
    }

    return JSON.stringify({ providers });
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
