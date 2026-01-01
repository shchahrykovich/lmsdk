import {DrizzleD1Database} from "drizzle-orm/d1";
import {and, asc, count, desc, eq} from "drizzle-orm";
import {traces, promptExecutionLogs, prompts} from "../db/schema";
import {parseTraceParent} from "../utils/trace-parser";

export interface TraceEntry {
    id: number;
    traceId: string;
    totalLogs: number;
    successCount: number;
    errorCount: number;
    totalDurationMs: number;
    firstLogAt: number | Date | null;
    lastLogAt: number | Date | null;
    tracePath: string | null;
    createdAt: number | Date;
    updatedAt: number | Date;
}

export type TraceDetails = Omit<TraceEntry, 'tracePath'>;

export interface TraceData {
    version: string;
    traceId: string;
    spanId: string;
    traceFlags: string;
    sampled: boolean;
}

export interface LogWithSpan {
    id: number;
    tenantId: number;
    projectId: number;
    promptId: number;
    version: number;
    isSuccess: boolean;
    errorMessage: string | null;
    durationMs: number | null;
    createdAt: number | Date;
    traceId: string | null;
    rawTraceId: string | null;
    promptName: string | null;
    promptSlug: string | null;
    trace: TraceData | null;
}

export interface TraceSort {
    field: "createdAt" | "updatedAt" | "totalLogs" | "totalDurationMs" | "firstLogAt" | "lastLogAt";
    direction: "asc" | "desc";
}

export interface TracesListResponse {
    traces: TraceEntry[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export class TraceService {
    private db: DrizzleD1Database;

    constructor(db: DrizzleD1Database, _r2?: R2Bucket) {
        this.db = db;
    }

    /**
     * List traces for a project with pagination and sorting
     */
    async listProjectTraces(
        tenantId: number,
        projectId: number,
        page: number = 1,
        pageSize: number = 10,
        sort?: TraceSort
    ): Promise<TracesListResponse> {
        // Build where conditions
        const whereConditions = [
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
        ];

        // Get total count
        const [{value: totalCount}] = await this.db
            .select({value: count()})
            .from(traces)
            .where(and(...whereConditions));

        // Build sort clause
        let orderClause;
        if (sort) {
            const sortColumn = traces[sort.field];
            orderClause = sort.direction === "asc" ? asc(sortColumn) : desc(sortColumn);
        } else {
            // Default sort by createdAt desc
            orderClause = desc(traces.createdAt);
        }

        // Get paginated results
        const offset = (page - 1) * pageSize;
        const traceRecords = await this.db
            .select()
            .from(traces)
            .where(and(...whereConditions))
            .orderBy(orderClause)
            .limit(pageSize)
            .offset(offset);

        const totalPages = Math.ceil(totalCount / pageSize);

        return {
            traces: traceRecords,
            total: totalCount,
            page,
            pageSize,
            totalPages,
        };
    }

    /**
     * Get trace details by trace ID
     */
    async getTraceDetails(
        tenantId: number,
        projectId: number,
        traceId: string
    ): Promise<{
        trace: TraceDetails | null;
        logs: LogWithSpan[];
    }> {
        // Get trace record (excluding tracePath)
        const [traceRecord] = await this.db
            .select({
                id: traces.id,
                traceId: traces.traceId,
                projectId: traces.projectId,
                totalLogs: traces.totalLogs,
                successCount: traces.successCount,
                errorCount: traces.errorCount,
                totalDurationMs: traces.totalDurationMs,
                firstLogAt: traces.firstLogAt,
                lastLogAt: traces.lastLogAt,
                createdAt: traces.createdAt,
                updatedAt: traces.updatedAt,
            })
            .from(traces)
            .where(
                and(
                    eq(traces.tenantId, tenantId),
                    eq(traces.projectId, projectId),
                    eq(traces.traceId, traceId)
                )
            )
            .limit(1);

        if (!traceRecord) {
            return {trace: null, logs: []};
        }

        // Get all logs for this trace with prompt information (excluding logPath)
        const logRecords = await this.db
            .select({
                id: promptExecutionLogs.id,
                tenantId: promptExecutionLogs.tenantId,
                projectId: promptExecutionLogs.projectId,
                promptId: promptExecutionLogs.promptId,
                version: promptExecutionLogs.version,
                isSuccess: promptExecutionLogs.isSuccess,
                errorMessage: promptExecutionLogs.errorMessage,
                durationMs: promptExecutionLogs.durationMs,
                createdAt: promptExecutionLogs.createdAt,
                traceId: promptExecutionLogs.traceId,
                rawTraceId: promptExecutionLogs.rawTraceId,
                promptName: prompts.name,
                promptSlug: prompts.slug,
            })
            .from(promptExecutionLogs)
            .leftJoin(
                prompts,
                and(
                    eq(promptExecutionLogs.promptId, prompts.id),
                    eq(promptExecutionLogs.tenantId, prompts.tenantId)
                )
            )
            .where(
                and(
                    eq(promptExecutionLogs.tenantId, tenantId),
                    eq(promptExecutionLogs.projectId, projectId),
                    eq(promptExecutionLogs.traceId, traceId)
                )
            )
            .orderBy(asc(promptExecutionLogs.createdAt));

        // Parse rawTraceId to extract span information for each log
        const logsWithSpans: LogWithSpan[] = logRecords.map(log => {
            let trace: TraceData | null = null;

            if (log.rawTraceId) {
                const parsed = parseTraceParent(log.rawTraceId);
                if (parsed) {
                    trace = {
                        version: parsed.version,
                        traceId: parsed.traceId,
                        spanId: parsed.parentSpanId,
                        traceFlags: parsed.traceFlags,
                        sampled: parsed.sampled,
                    };
                }
            }

            return {
                ...log,
                trace,
            };
        });

        return {
            trace: traceRecord,
            logs: logsWithSpans,
        };
    }
}
