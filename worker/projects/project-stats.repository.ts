import { drizzle } from "drizzle-orm/d1";
import { and, count, eq, gte, max, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { dataSets, evaluations, promptExecutionLogs, prompts, traces } from "../db/schema.ts";

export interface StatsScope {
  tenantId: number;
  projectId?: number;
}

export interface ProjectCountRow {
  projectId: number;
  value: number;
}

export interface ExecutionTotalsRow {
  projectId: number;
  total: number;
  succeeded: number;
  durationSumMs: number;
  timedCount: number;
  totalTokens: number;
  costUsd: number;
  unpricedCount: number;
  lastExecutionAt: Date | null;
}

export interface DataSetTotalsRow {
  projectId: number;
  datasets: number;
  records: number;
}

export interface DailyExecutionsRow {
  day: string;
  total: number;
  failed: number;
}

interface ScopedTable {
  tenantId: SQLiteColumn;
  projectId: SQLiteColumn;
}

const sumOf = (expression: SQL | SQLiteColumn) =>
  sql<number>`coalesce(sum(${expression}), 0)`.mapWith(Number);

export class ProjectStatsRepository {
  private db;

  constructor(database: D1Database) {
    this.db = drizzle(database);
  }

  private scopeWhere(table: ScopedTable, scope: StatsScope): SQL {
    const tenantFilter = eq(table.tenantId, scope.tenantId);
    if (scope.projectId === undefined) {
      return tenantFilter;
    }
    return and(tenantFilter, eq(table.projectId, scope.projectId))!;
  }

  async countActivePrompts(scope: StatsScope): Promise<ProjectCountRow[]> {
    return await this.db
      .select({ projectId: prompts.projectId, value: count() })
      .from(prompts)
      .where(and(this.scopeWhere(prompts, scope), eq(prompts.isActive, true)))
      .groupBy(prompts.projectId);
  }

  async countTraces(scope: StatsScope): Promise<ProjectCountRow[]> {
    return await this.db
      .select({ projectId: traces.projectId, value: count() })
      .from(traces)
      .where(this.scopeWhere(traces, scope))
      .groupBy(traces.projectId);
  }

  async countEvaluations(scope: StatsScope): Promise<ProjectCountRow[]> {
    return await this.db
      .select({ projectId: evaluations.projectId, value: count() })
      .from(evaluations)
      .where(this.scopeWhere(evaluations, scope))
      .groupBy(evaluations.projectId);
  }

  async sumDataSets(scope: StatsScope): Promise<DataSetTotalsRow[]> {
    return await this.db
      .select({
        projectId: dataSets.projectId,
        datasets: count(),
        records: sumOf(dataSets.countOfRecords),
      })
      .from(dataSets)
      .where(and(this.scopeWhere(dataSets, scope), eq(dataSets.isDeleted, false)))
      .groupBy(dataSets.projectId);
  }

  async sumExecutions(scope: StatsScope): Promise<ExecutionTotalsRow[]> {
    const cost = sql`json_extract(${promptExecutionLogs.usage}, '$.cost')`;
    return await this.db
      .select({
        projectId: promptExecutionLogs.projectId,
        total: count(),
        succeeded: sumOf(promptExecutionLogs.isSuccess),
        durationSumMs: sumOf(promptExecutionLogs.durationMs),
        timedCount: count(promptExecutionLogs.durationMs),
        totalTokens: sumOf(sql`json_extract(${promptExecutionLogs.usage}, '$.total_tokens')`),
        costUsd: sumOf(cost),
        unpricedCount: sumOf(sql`case when ${promptExecutionLogs.usage} is not null and ${cost} is null then 1 else 0 end`),
        lastExecutionAt: max(promptExecutionLogs.createdAt),
      })
      .from(promptExecutionLogs)
      .where(this.scopeWhere(promptExecutionLogs, scope))
      .groupBy(promptExecutionLogs.projectId);
  }

  async countDailyExecutions(scope: StatsScope, since: Date): Promise<DailyExecutionsRow[]> {
    const day = sql<string>`date(${promptExecutionLogs.createdAt}, 'unixepoch')`;
    return await this.db
      .select({
        day,
        total: count(),
        failed: sumOf(sql`case when ${promptExecutionLogs.isSuccess} = 0 then 1 else 0 end`),
      })
      .from(promptExecutionLogs)
      .where(and(this.scopeWhere(promptExecutionLogs, scope), gte(promptExecutionLogs.createdAt, since)))
      .groupBy(day)
      .orderBy(day);
  }
}
