/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Coins,
  Database,
  DollarSign,
  FileText,
  FlaskConical,
  GitBranch,
} from "lucide-react";
import StatCard from "./StatCard";
import { formatDate, formatDuration } from "@/lib/format";
import {
  costDetail,
  formatCompact,
  formatCost,
  formatCount,
  formatRate,
  successRate,
  type ProjectStats,
} from "@/lib/project-stats";

type StatsGridProps = Readonly<{
  stats: ProjectStats;
}>;

const ICON_SIZE = 16;

export default function StatsGrid({ stats }: StatsGridProps): React.ReactNode {
  const { executions } = stats;
  const lastRun = executions.lastExecutionAt
    ? `Last run ${formatDate(executions.lastExecutionAt, { month: "short", hour: "numeric", minute: "2-digit" })}`
    : "No runs yet";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <StatCard
        label="Executions"
        value={formatCount(executions.total)}
        detail={lastRun}
        icon={<Activity size={ICON_SIZE} />}
      />
      <StatCard
        label="Success rate"
        value={formatRate(successRate(executions))}
        detail={`${formatCount(executions.failed)} failed`}
        icon={<CheckCircle2 size={ICON_SIZE} />}
      />
      <StatCard
        label="Avg latency"
        value={executions.avgDurationMs === null ? "—" : formatDuration(executions.avgDurationMs)}
        detail="Per execution"
        icon={<Clock size={ICON_SIZE} />}
      />
      <StatCard
        label="Tokens"
        value={formatCompact(executions.totalTokens)}
        detail={`${formatCount(executions.totalTokens)} total`}
        icon={<Coins size={ICON_SIZE} />}
      />
      <StatCard
        label="Cost"
        value={formatCost(executions.costUsd)}
        detail={costDetail(executions)}
        icon={<DollarSign size={ICON_SIZE} />}
      />
      <StatCard label="Prompts" value={formatCount(stats.prompts)} icon={<FileText size={ICON_SIZE} />} />
      <StatCard label="Traces" value={formatCount(stats.traces)} icon={<GitBranch size={ICON_SIZE} />} />
      <StatCard
        label="Datasets"
        value={formatCount(stats.datasets)}
        detail={`${formatCount(stats.datasetRecords)} records`}
        icon={<Database size={ICON_SIZE} />}
      />
      <StatCard
        label="Evaluations"
        value={formatCount(stats.evaluations)}
        icon={<FlaskConical size={ICON_SIZE} />}
      />
    </div>
  );
}
