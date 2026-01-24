import {ProjectId} from "../shared/project-id";

export type Timestamp = number | Date;
export type NullableTimestamp = Timestamp | null;

export interface TraceRecord {
	id: number;
	traceId: string;
	projectId: number;
	totalLogs: number;
	successCount: number;
	errorCount: number;
	totalDurationMs: number;
	stats: string | null;
	firstLogAt: NullableTimestamp;
	lastLogAt: NullableTimestamp;
	tracePath: string | null;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface TraceDetailsRecord {
	id: number;
	traceId: string;
	projectId: number;
	totalLogs: number;
	successCount: number;
	errorCount: number;
	totalDurationMs: number;
	stats: string | null;
	firstLogAt: NullableTimestamp;
	lastLogAt: NullableTimestamp;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface LogRecord {
	id: number;
	tenantId: number;
	projectId: number;
	promptId: number;
	version: number;
	isSuccess: boolean;
	errorMessage: string | null;
	durationMs: number | null;
	createdAt: Timestamp;
	traceId: string | null;
	rawTraceId: string | null;
	promptName: string | null;
	promptSlug: string | null;
}

export interface TraceSort {
	field: "createdAt" | "updatedAt" | "totalLogs" | "totalDurationMs" | "firstLogAt" | "lastLogAt";
	direction: "asc" | "desc";
}

export interface UsageStats {
	providers: {
		provider: string;
		models: {
			model: string;
			count: number;
			tokens: {
				[key: string]: number;
			};
		}[];
	}[];
}

export interface TraceEntry {
	id: number;
	traceId: string;
	totalLogs: number;
	successCount: number;
	errorCount: number;
	totalDurationMs: number;
	stats: UsageStats | null;
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

export interface TracesListResponse {
	traces: TraceEntry[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface ListProjectTracesParams {
	projectId: ProjectId;
	page?: number;
	pageSize?: number;
	sort?: TraceSort;
}
