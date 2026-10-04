import {
  ProjectStatsRepository,
  type DailyExecutionsRow,
  type StatsScope,
} from "./project-stats.repository.ts";
import type { ProjectId } from "../shared/project-id";
import { roundUsd } from "../pricing/cost";

export const DAILY_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExecutionStats {
  total: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number | null;
  totalTokens: number;
  costUsd: number;
  unpricedCount: number;
  lastExecutionAt: Date | null;
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

const SUMMED_FIELDS = [
  "prompts",
  "executions",
  "succeeded",
  "durationSumMs",
  "timedCount",
  "totalTokens",
  "costUsd",
  "unpricedCount",
  "traces",
  "datasets",
  "datasetRecords",
  "evaluations",
] as const;

type StatsTally = Record<(typeof SUMMED_FIELDS)[number], number> & {
  lastExecutionAt: Date | null;
};

const emptyTally = (): StatsTally => ({
  ...(Object.fromEntries(SUMMED_FIELDS.map((field) => [field, 0])) as Record<(typeof SUMMED_FIELDS)[number], number>),
  lastExecutionAt: null,
});

const laterDate = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
};

const mergeTally = (target: StatsTally, part: Partial<StatsTally>): void => {
  for (const field of SUMMED_FIELDS) {
    target[field] += part[field] ?? 0;
  }
  target.lastExecutionAt = laterDate(target.lastExecutionAt, part.lastExecutionAt ?? null);
};

const toProjectStats = (tally: StatsTally): ProjectStats => ({
  prompts: tally.prompts,
  executions: {
    total: tally.executions,
    succeeded: tally.succeeded,
    failed: tally.executions - tally.succeeded,
    avgDurationMs: tally.timedCount > 0 ? Math.round(tally.durationSumMs / tally.timedCount) : null,
    totalTokens: tally.totalTokens,
    costUsd: roundUsd(tally.costUsd),
    unpricedCount: tally.unpricedCount,
    lastExecutionAt: tally.lastExecutionAt,
  },
  traces: tally.traces,
  datasets: tally.datasets,
  datasetRecords: tally.datasetRecords,
  evaluations: tally.evaluations,
});

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export class ProjectStatsService {
  private repository: ProjectStatsRepository;

  constructor(database: D1Database) {
    this.repository = new ProjectStatsRepository(database);
  }

  async getProjectStats(projectId: ProjectId, now: Date = new Date()): Promise<ProjectStatsResponse> {
    const scope = { tenantId: projectId.tenantId, projectId: projectId.id };
    const [tallies, daily] = await Promise.all([this.tallyByProject(scope), this.dailyExecutions(scope, now)]);
    const tally = tallies.get(projectId.id) ?? emptyTally();
    return { stats: toProjectStats(tally), daily };
  }

  async getTenantStats(tenantId: number, now: Date = new Date()): Promise<TenantStatsResponse> {
    const scope = { tenantId };
    const [tallies, daily] = await Promise.all([this.tallyByProject(scope), this.dailyExecutions(scope, now)]);
    const totals = emptyTally();
    const projects = [...tallies.entries()].map(([projectId, tally]) => {
      mergeTally(totals, tally);
      return { projectId, stats: toProjectStats(tally) };
    });
    return { totals: toProjectStats(totals), daily, projects };
  }

  private async tallyByProject(scope: StatsScope): Promise<Map<number, StatsTally>> {
    const [prompts, executions, traces, dataSets, evaluations] = await Promise.all([
      this.repository.countActivePrompts(scope),
      this.repository.sumExecutions(scope),
      this.repository.countTraces(scope),
      this.repository.sumDataSets(scope),
      this.repository.countEvaluations(scope),
    ]);

    const tallies = new Map<number, StatsTally>();
    const add = (projectId: number, part: Partial<StatsTally>) => {
      const tally = tallies.get(projectId) ?? emptyTally();
      mergeTally(tally, part);
      tallies.set(projectId, tally);
    };

    prompts.forEach((row) => add(row.projectId, { prompts: row.value }));
    executions.forEach((row) =>
      add(row.projectId, {
        executions: row.total,
        succeeded: row.succeeded,
        durationSumMs: row.durationSumMs,
        timedCount: row.timedCount,
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
        unpricedCount: row.unpricedCount,
        lastExecutionAt: row.lastExecutionAt,
      })
    );
    traces.forEach((row) => add(row.projectId, { traces: row.value }));
    dataSets.forEach((row) => add(row.projectId, { datasets: row.datasets, datasetRecords: row.records }));
    evaluations.forEach((row) => add(row.projectId, { evaluations: row.value }));

    return tallies;
  }

  private async dailyExecutions(scope: StatsScope, now: Date): Promise<DailyExecutions[]> {
    const since = new Date(startOfUtcDay(now).getTime() - (DAILY_WINDOW_DAYS - 1) * DAY_MS);
    const rows = await this.repository.countDailyExecutions(scope, since);
    return fillDays(rows, since);
  }
}

function fillDays(rows: DailyExecutionsRow[], since: Date): DailyExecutions[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: DAILY_WINDOW_DAYS }, (_, index) => {
    const date = isoDay(new Date(since.getTime() + index * DAY_MS));
    const row = byDay.get(date);
    return { date, total: row?.total ?? 0, failed: row?.failed ?? 0 };
  });
}
