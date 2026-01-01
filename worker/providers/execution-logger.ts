import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { promptExecutionLogs } from "../db/schema";
import type { ExecutionLogQueueMessage } from "../queue/messages";
import { parseTraceParent } from "../utils/trace-parser";

/**
 * Context for prompt execution logging
 */
export interface PromptExecutionContext {
  tenantId: number;
  projectId: number;
  promptId: number;
  version: number;
  rawTraceId?: string;
}

/**
 * Input data for prompt execution
 */
export interface InputLogData {
  model: string;
  messages: Array<{ role: string; content: string }>;
  response_format?: any;
  openai_settings?: any;
}


/**
 * Variables used in prompt execution
 */
export interface VariablesLogData {
  variables: Record<string, any>;
}

/**
 * Interface for logging prompt executions
 */
export interface IPromptExecutionLogger {
  /**
   * Set the execution context (tenantId, projectId, promptId, version)
   * This allows subsequent log calls to omit these parameters
   */
  setContext(context: PromptExecutionContext): void;

  /**
   * Log input data (model, messages, settings)
   */
  logInput(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    input: InputLogData;
  }): Promise<void>;

  /**
   * Log output data (content, usage)
   */
  logOutput(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    output: unknown;
  }): Promise<void>;

  /**
   * Log result data (provider response payload)
   */
  logResult(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    output: unknown;
  }): Promise<void>;

  /**
   * Log final API response payload
   */
  logResponse(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    output: unknown;
  }): Promise<void>;

  /**
   * Log variables used in execution
   */
  logVariables(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    variables: Record<string, any>;
  }): Promise<void>;

  /**
   * Log successful execution completion
   */
  logSuccess(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    durationMs: number;
  }): Promise<void>;

  /**
   * Log failed execution
   */
  logError(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    durationMs: number;
    errorMessage: string;
  }): Promise<void>;

  /**
   * Wait for all pending logging operations to complete
   * Use with ctx.waitUntil() to defer persistence operations
   */
  finish(): Promise<void>;
}

/**
 * Null implementation that does nothing
 * Useful for testing or when logging is disabled
 */
export class NullPromptExecutionLogger implements IPromptExecutionLogger {
  setContext(): void {
    // No-op
  }

  async logInput(): Promise<void> {
    // No-op
  }

  async logOutput(): Promise<void> {
    // No-op
  }

  async logResult(): Promise<void> {
    // No-op
  }

  async logResponse(): Promise<void> {
    // No-op
  }

  async logVariables(): Promise<void> {
    // No-op
  }

  async logSuccess(): Promise<void> {
    // No-op
  }

  async logError(): Promise<void> {
    // No-op
  }

  async finish(): Promise<void> {
    // No-op
  }
}

/**
 * Cloudflare implementation that logs to D1 database and R2 storage
 * Uses deferred persistence for improved latency
 * On finish, sends a message to the queue for background processing
 */
export class CFPromptExecutionLogger implements IPromptExecutionLogger {
  private context?: PromptExecutionContext;
  private db: DrizzleD1Database;
  private r2: R2Bucket;
  private queue: Queue;
  private inputData?: InputLogData;
  private outputData?: unknown;
  private resultData?: unknown;
  private responseData?: unknown;
  private variablesData?: Record<string, any>;
  private pendingTasks: Promise<void>[] = [];
  private queueMessage?: ExecutionLogQueueMessage;
  private rawTraceId?: string;
  private traceId?: string;
  private logRecord?: {
    tenantId: number;
    projectId: number;
    promptId: number;
    version: number;
    logId: number;
    logPath: string;
    durationMs: number;
    timestamp: string;
    isSuccess: boolean;
    errorMessage?: string;
  };

  constructor(db: DrizzleD1Database, r2: R2Bucket, queue: Queue) {
    this.db = db;
    this.r2 = r2;
    this.queue = queue;
  }

  setContext(context: PromptExecutionContext): void {
    this.context = context;
    this.rawTraceId = context.rawTraceId;

    // Parse traceparent to extract traceId
    if (context.rawTraceId) {
      const parsed = parseTraceParent(context.rawTraceId);
      this.traceId = parsed?.traceId;
    } else {
      this.traceId = undefined;
    }

    // Reset accumulated data when context changes
    this.inputData = undefined;
    this.outputData = undefined;
    this.responseData = undefined;
    this.resultData = undefined;
    this.variablesData = undefined;
    this.pendingTasks = [];
    this.queueMessage = undefined;
    this.logRecord = undefined;
  }

  /**
   * Wait for all pending logging operations to complete
   * Then send a message to the queue for background R2 processing
   */
  async finish(): Promise<void> {
    await Promise.all(this.pendingTasks);
    this.pendingTasks = [];

    if (this.logRecord) {
      const metadata: Record<string, unknown> = {
        tenantId: this.logRecord.tenantId,
        projectId: this.logRecord.projectId,
        promptId: this.logRecord.promptId,
        version: this.logRecord.version,
        timestamp: this.logRecord.timestamp,
        durationMs: this.logRecord.durationMs,
      };

      if (!this.logRecord.isSuccess && this.logRecord.errorMessage) {
        metadata.error = this.logRecord.errorMessage;
      }

      const r2Tasks: Promise<void>[] = [
        this.saveToR2Path(this.logRecord.logPath, "metadata.json", metadata),
      ];

      if (this.inputData) {
        r2Tasks.push(this.saveToR2Path(this.logRecord.logPath, "input.json", this.inputData));
      }

      if (this.resultData) {
        r2Tasks.push(this.saveToR2Path(this.logRecord.logPath, "result.json", this.resultData));
      }

      if (this.outputData) {
        r2Tasks.push(this.saveToR2Path(this.logRecord.logPath, "output.json", this.outputData));
      }

      if (this.variablesData) {
        r2Tasks.push(this.saveToR2Path(this.logRecord.logPath, "variables.json", this.variablesData));
      }

      if (this.responseData) {
        r2Tasks.push(this.saveToR2Path(this.logRecord.logPath, "response.json", this.responseData));
      }

      await Promise.all(r2Tasks);
    }

    // Send queue message if we have a log to process
    if (this.queueMessage) {
      await this.queue.send(this.queueMessage);
      this.queueMessage = undefined;
    }

    this.inputData = undefined;
    this.outputData = undefined;
    this.resultData = undefined;
    this.responseData = undefined;
    this.variablesData = undefined;
    this.logRecord = undefined;
  }

  private async saveToR2Path(
    logPath: string,
    filename: string,
    data: unknown
  ): Promise<void> {
    await this.r2.put(`${logPath}/${filename}`, JSON.stringify(data, null, 2), {
      httpMetadata: {
        contentType: "application/json",
      },
    });
  }

  async logInput(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    input: InputLogData;
  }): Promise<void> {
    // Just accumulate data - persistence happens in finish
    this.inputData = params.input;
  }

  async logOutput(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    output: unknown;
  }): Promise<void> {
    // Just accumulate data - persistence happens in finish
    this.outputData = params.output;
  }

  async logResult(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    output: unknown;
  }): Promise<void> {
    this.resultData = params.output;
  }

  async logResponse(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    output: unknown;
  }): Promise<void> {
    this.responseData = params.output;
  }

  async logVariables(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    variables: Record<string, any>;
  }): Promise<void> {
    // Just accumulate data - persistence happens in finish
    this.variablesData = params.variables;
  }

  async logSuccess(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    durationMs: number;
  }): Promise<void> {
    const tenantId = params.tenantId ?? this.context?.tenantId;
    const projectId = params.projectId ?? this.context?.projectId;
    const promptId = params.promptId ?? this.context?.promptId;
    const version = params.version ?? this.context?.version;

    if (tenantId === undefined || projectId === undefined || promptId === undefined || version === undefined) {
      throw new Error("Missing required context: tenantId, projectId, promptId, and version must be provided either via setContext() or params");
    }

    const durationMs = params.durationMs;
    const now = new Date();
    const timestamp = now.toISOString();

    // Add all persistence operations as a single task
    const task = (async () => {
      // Insert log record and get the ID
      const [logRecord] = await this.db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId,
        version,
        isSuccess: true,
        durationMs,
        rawTraceId: this.rawTraceId,
        traceId: this.traceId,
      }).returning();

      if (!logRecord) {
        throw new Error("Failed to create log record");
      }

      // Generate R2 path for the log directory
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const currentDay = `${year}-${month}-${day}`;
      const logPath = `logs/${tenantId}/${currentDay}/${projectId}/${promptId}/${version}/${logRecord.id}`;

      // Update the log record with the R2 path
      await this.db.update(promptExecutionLogs)
        .set({ logPath })
        .where(eq(promptExecutionLogs.id, logRecord.id));

      this.logRecord = {
        tenantId,
        projectId,
        promptId,
        version,
        logId: logRecord.id,
        logPath,
        durationMs,
        timestamp,
        isSuccess: true,
      };

      // Prepare queue message for background processing
      this.queueMessage = {
        tenantId,
        projectId,
        promptId,
        version,
        logId: logRecord.id,
      };
    })();

    this.pendingTasks.push(task);
  }

  async logError(params: {
    tenantId?: number;
    projectId?: number;
    promptId?: number;
    version?: number;
    durationMs: number;
    errorMessage: string;
  }): Promise<void> {
    const tenantId = params.tenantId ?? this.context?.tenantId;
    const projectId = params.projectId ?? this.context?.projectId;
    const promptId = params.promptId ?? this.context?.promptId;
    const version = params.version ?? this.context?.version;

    if (tenantId === undefined || projectId === undefined || promptId === undefined || version === undefined) {
      throw new Error("Missing required context: tenantId, projectId, promptId, and version must be provided either via setContext() or params");
    }

    const durationMs = params.durationMs;
    const errorMessage = params.errorMessage;
    const now = new Date();
    const timestamp = now.toISOString();

    // Add all persistence operations as a single task
    const task = (async () => {
      // Insert log record and get the ID
      const [logRecord] = await this.db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId,
        version,
        isSuccess: false,
        errorMessage,
        durationMs,
        rawTraceId: this.rawTraceId,
        traceId: this.traceId,
      }).returning();

      if (!logRecord) {
        throw new Error("Failed to create log record");
      }

      // Generate R2 path for the log directory
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const currentDay = `${year}-${month}-${day}`;
      const logPath = `logs/${tenantId}/${currentDay}/${projectId}/${promptId}/${version}/${logRecord.id}`;

      // Update the log record with the R2 path
      await this.db.update(promptExecutionLogs)
        .set({ logPath })
        .where(eq(promptExecutionLogs.id, logRecord.id));

      this.logRecord = {
        tenantId,
        projectId,
        promptId,
        version,
        logId: logRecord.id,
        logPath,
        durationMs,
        timestamp,
        isSuccess: false,
        errorMessage,
      };

      // Prepare queue message for background processing
      this.queueMessage = {
        tenantId,
        projectId,
        promptId,
        version,
        logId: logRecord.id,
      };
    })();

    this.pendingTasks.push(task);
  }
}
