export interface LogEntry {
	id: number;
	tenantId: number;
	projectId: number;
	promptId: number;
	version: number;
	logPath: string | null;
	isSuccess: boolean;
	errorMessage: string | null;
	durationMs: number | null;
	createdAt: number | string;
	traceId: string | null;
	promptName: string | null;
	promptSlug: string | null;
}

export interface SpanData {
	log: LogEntry;
	startTime: number;
	duration: number;
	relativeStart: number;
	relativeEnd: number;
}

export interface GroupedSpans {
	promptName: string;
	promptId: number;
	version: number;
	spans: SpanData[];
	totalDuration: number;
	successCount: number;
	errorCount: number;
	minStartTime: number;
	maxEndTime: number;
	relativeStart: number;
	relativeEnd: number;
}
