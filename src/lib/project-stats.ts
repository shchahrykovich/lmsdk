export interface ExecutionStats {
  total: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number | null;
  totalTokens: number;
  lastExecutionAt: string | null;
}

export interface ProjectStats {
  prompts: number;
  executions: ExecutionStats;
  traces: number;
  datasets: number;
  datasetRecords: number;
  evaluations: number;
}

export interface DailyExecutions {
  date: string;
  total: number;
  failed: number;
}

export interface ProjectStatsResponse {
  stats: ProjectStats;
  daily: DailyExecutions[];
}

export interface TenantStatsResponse {
  totals: ProjectStats;
  daily: DailyExecutions[];
  projects: { projectId: number; stats: ProjectStats }[];
}

const countFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatCount(value: number): string {
  return countFormat.format(value);
}

export function formatCompact(value: number): string {
  return compactFormat.format(value);
}

export function successRate(executions: Pick<ExecutionStats, "total" | "succeeded">): number | null {
  if (executions.total === 0) return null;
  return executions.succeeded / executions.total;
}

export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  const percent = rate * 100;
  return `${percent === 100 || percent === 0 ? percent : percent.toFixed(1)}%`;
}

export function formatDayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`)
  );
}

export function barHeightPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(4, Math.round((value / max) * 100));
}
