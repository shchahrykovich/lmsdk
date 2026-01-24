import {TracesRepository} from "./traces.repository.ts";
import {parseTraceParent} from "../utils/trace-parser.ts";
import type {EntityId} from "../shared/entity-id";
import type {ListProjectTracesParams, LogWithSpan, TraceData, TraceDetails, TracesListResponse} from "./dto";

export class TraceService {
    private repository: TracesRepository;

    constructor(database: D1Database) {
        this.repository = new TracesRepository(database);
    }

    /**
     * List traces for a project with pagination and sorting
     */
    async listProjectTraces(params: ListProjectTracesParams): Promise<TracesListResponse> {
        const {projectId, page = 1, pageSize = 10, sort} = params;

        const totalCount = await this.repository.countByProject(projectId);

        const offset = (page - 1) * pageSize;
        const traceRecords = await this.repository.findByProjectPaginated(
            projectId,
            pageSize,
            offset,
            sort
        );

        const parsedTraces = traceRecords.map(trace => ({
            ...trace,
            stats: trace.stats ? JSON.parse(trace.stats) : null,
        }));

        const totalPages = Math.ceil(totalCount / pageSize);

        return {
            traces: parsedTraces,
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
        traceId: EntityId<string>
    ): Promise<{
        trace: TraceDetails | null;
        logs: LogWithSpan[];
    }> {
        const traceRecord = await this.repository.findById(traceId);

        if (!traceRecord) {
            return {trace: null, logs: []};
        }

        const parsedTrace = {
            ...traceRecord,
            stats: traceRecord.stats ? JSON.parse(traceRecord.stats) : null,
        };

        const logRecords = await this.repository.findLogsByTraceId(traceId);

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
            trace: parsedTrace,
            logs: logsWithSpans,
        };
    }
}
