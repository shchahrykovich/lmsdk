/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { formatCost, formatCount, formatRate, successRate, type ProjectStats } from "@/lib/project-stats";

type ProjectStatsCellsProps = Readonly<{
  stats: ProjectStats | undefined;
}>;

const cellClassName = "px-6 py-4 whitespace-nowrap text-sm text-muted-foreground text-right tabular-nums";

export default function ProjectStatsCells({ stats }: ProjectStatsCellsProps): React.ReactNode {
  return (
    <>
      <td className={cellClassName}>{formatCount(stats?.prompts ?? 0)}</td>
      <td className={cellClassName}>{formatCount(stats?.executions.total ?? 0)}</td>
      <td className={cellClassName}>{formatRate(stats ? successRate(stats.executions) : null)}</td>
      <td className={cellClassName}>{formatCost(stats?.executions.costUsd ?? 0)}</td>
    </>
  );
}
