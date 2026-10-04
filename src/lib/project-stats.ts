export interface ExecutionStats {
  total: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number | null;
  totalTokens: number;
  costUsd: number;
  unpricedCount: number;
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

const dollarFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const smallDollarFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 2,
});
const SMALLEST_SHOWN_USD = 0.0001;

export function formatCost(value: number): string {
  if (value === 0 || value >= 0.01) return dollarFormat.format(value);
  if (value < SMALLEST_SHOWN_USD) return "<$0.0001";
  return smallDollarFormat.format(value);
}

export function costDetail(executions: Pick<ExecutionStats, "unpricedCount">): string {
  if (executions.unpricedCount === 0) return "Total spend";
  return `${countFormat.format(executions.unpricedCount)} runs without a price`;
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
