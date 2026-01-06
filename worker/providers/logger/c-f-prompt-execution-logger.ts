import type {DrizzleD1Database} from "drizzle-orm/d1";
import type {ExecutionLogQueueMessage} from "../../queue/messages.ts";
import {parseTraceParent} from "../../utils/trace-parser.ts";
import {promptExecutionLogs} from "../../db/schema.ts";
import {eq} from "drizzle-orm";
import type {IPromptExecutionLogger, PromptExecutionContext} from "./execution-logger.ts";

export class CFPromptExecutionLogger implements IPromptExecutionLogger {
    private context?: PromptExecutionContext;
    private db: DrizzleD1Database;
    private r2: R2Bucket;
    private queue: Queue;
    private inputData?: unknown;
    private outputData?: unknown;
    private resultData?: unknown;
    private responseData?: unknown;
    private variablesData?: Record<string, unknown>;
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
    private createdAt: Date;

    constructor(db: DrizzleD1Database, r2: R2Bucket, queue: Queue) {
        this.db = db;
        this.r2 = r2;
        this.queue = queue;
        this.createdAt = new Date();
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

    logInput(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        input: unknown;
    }): Promise<void> {
        // Just accumulate data - persistence happens in finish
        this.inputData = params.input;
        return Promise.resolve();
    }

    logOutput(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        output: unknown;
    }): Promise<void> {
        // Just accumulate data - persistence happens in finish
        this.outputData = params.output;
        return Promise.resolve();
    }

    logResult(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        output: unknown;
    }): Promise<void> {
        this.resultData = params.output;
        return Promise.resolve();
    }

    logResponse(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        output: unknown;
    }): Promise<void> {
        this.responseData = params.output;
        return Promise.resolve();
    }

    logVariables(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        variables: Record<string, unknown>;
    }): Promise<void> {
        // Just accumulate data - persistence happens in finish
        this.variablesData = params.variables;
        return Promise.resolve();
    }

    logSuccess(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        durationMs: number;
    }): Promise<void> {
        let context: { tenantId: number; projectId: number; promptId: number; version: number };
        try {
            context = this.resolveContextParams(params, "Missing required context");
        } catch (error) {
            const reason = error instanceof Error ? error : new Error(String(error));
            return Promise.reject(reason);
        }
        const task = this.createLogTask({
            ...context,
            durationMs: params.durationMs,
            isSuccess: true,
        });

        this.pendingTasks.push(task);
        return Promise.resolve();
    }

    logError(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        durationMs: number;
        errorMessage: string;
    }): Promise<void> {
        let context: { tenantId: number; projectId: number; promptId: number; version: number };
        try {
            context = this.resolveContextParams(
                params,
                "Missing required context: tenantId, projectId, promptId, and version must be provided either via setContext() or params"
            );
        } catch (error) {
            const reason = error instanceof Error ? error : new Error(String(error));
            return Promise.reject(reason);
        }
        const task = this.createLogTask({
            ...context,
            durationMs: params.durationMs,
            isSuccess: false,
            errorMessage: params.errorMessage,
        });

        this.pendingTasks.push(task);
        return Promise.resolve();
    }

    private resolveContextParams(
        params: {
            tenantId?: number;
            projectId?: number;
            promptId?: number;
            version?: number;
        },
        errorMessage: string
    ) {
        const resolved = {
            tenantId: params.tenantId ?? this.context?.tenantId,
            projectId: params.projectId ?? this.context?.projectId,
            promptId: params.promptId ?? this.context?.promptId,
            version: params.version ?? this.context?.version,
        };

        const missing = Object.values(resolved).some((value) => value === undefined);
        if (missing) {
            throw new Error(errorMessage);
        }

        return resolved as { tenantId: number; projectId: number; promptId: number; version: number };
    }

    private buildLogPath(params: {
        tenantId: number;
        projectId: number;
        promptId: number;
        version: number;
        logId: number;
        now: Date;
    }): string {
        const { tenantId, projectId, promptId, version, logId, now } = params;
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, "0");
        const day = String(now.getUTCDate()).padStart(2, "0");
        const currentDay = `${year}-${month}-${day}`;
        return `logs/${tenantId}/${currentDay}/${projectId}/${promptId}/${version}/${logId}`;
    }

    private async createLogTask(params: {
        tenantId: number;
        projectId: number;
        promptId: number;
        version: number;
        durationMs: number;
        isSuccess: boolean;
        errorMessage?: string;
    }): Promise<void> {
        const { tenantId, projectId, promptId, version, durationMs, isSuccess, errorMessage } = params;
        const now = new Date();
        const timestamp = now.toISOString();

        const [logRecord] = await this.db.insert(promptExecutionLogs).values({
            tenantId,
            projectId,
            promptId,
            version,
            isSuccess,
            errorMessage,
            durationMs,
            rawTraceId: this.rawTraceId,
            traceId: this.traceId,
            createdAt: this.createdAt,
        }).returning();

        if (!logRecord) {
            throw new Error("Failed to create log record");
        }

        const logPath = this.buildLogPath({
            tenantId,
            projectId,
            promptId,
            version,
            logId: logRecord.id,
            now,
        });

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
            isSuccess,
            errorMessage,
        };

        this.queueMessage = {
            tenantId,
            projectId,
            promptId,
            version,
            logId: logRecord.id,
        };
    }
}
