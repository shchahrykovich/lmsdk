import {drizzle} from "drizzle-orm/d1";
import {and, asc, count, desc, eq} from "drizzle-orm";
import {traces, promptExecutionLogs, prompts} from "../db/schema.ts";
import type {ProjectId} from "../shared/project-id";
import type {EntityId} from "../shared/entity-id";
import type {LogRecord, TraceDetailsRecord, TraceRecord, TraceSort} from "./dto";

export class TracesRepository {
    private db;

    constructor(database: D1Database) {
        this.db = drizzle(database);
    }

    async countByProject(projectId: ProjectId): Promise<number> {
        const [{value: totalCount}] = await this.db
            .select({value: count()})
            .from(traces)
            .where(projectId.toWhereClause(traces));

        return totalCount;
    }

    async findByProjectPaginated(
        projectId: ProjectId,
        limit: number,
        offset: number,
        sort?: TraceSort
    ): Promise<TraceRecord[]> {
        let orderClause;
        if (sort) {
            const sortColumn = traces[sort.field];
            orderClause = sort.direction === "asc" ? asc(sortColumn) : desc(sortColumn);
        } else {
            orderClause = desc(traces.createdAt);
        }

        return await this.db
            .select()
            .from(traces)
            .where(projectId.toWhereClause(traces))
            .orderBy(orderClause)
            .limit(limit)
            .offset(offset);
    }

    async findById(traceId: EntityId<string>): Promise<TraceDetailsRecord | undefined> {
        const [traceRecord] = await this.db
            .select({
                id: traces.id,
                traceId: traces.traceId,
                projectId: traces.projectId,
                totalLogs: traces.totalLogs,
                successCount: traces.successCount,
                errorCount: traces.errorCount,
                totalDurationMs: traces.totalDurationMs,
                stats: traces.stats,
                firstLogAt: traces.firstLogAt,
                lastLogAt: traces.lastLogAt,
                createdAt: traces.createdAt,
                updatedAt: traces.updatedAt,
            })
            .from(traces)
            .where(
                and(
                    eq(traces.tenantId, traceId.tenantId),
                    eq(traces.projectId, traceId.projectId),
                    eq(traces.traceId, traceId.id)
                )
            )
            .limit(1);

        return traceRecord;
    }

    async findLogsByTraceId(traceId: EntityId<string>): Promise<LogRecord[]> {
        return await this.db
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
                    eq(promptExecutionLogs.tenantId, traceId.tenantId),
                    eq(promptExecutionLogs.projectId, traceId.projectId),
                    eq(promptExecutionLogs.traceId, traceId.id)
                )
            )
            .orderBy(asc(promptExecutionLogs.createdAt));
    }
}
