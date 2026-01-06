/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { Button } from "@/components/ui/button";

type ProjectPageHeaderProps = Readonly<{
  projectName: string;
  pageTitle?: string;
  description: string | React.ReactNode;
  actionIcon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}>;

export default function ProjectPageHeader({
  projectName,
  pageTitle,
  description,
  actionIcon,
  actionLabel,
  onAction,
  badge,
  actions,
}: ProjectPageHeaderProps): React.ReactNode {
  return (
    <div className="border-b border-border bg-card shrink-0">
      <div className="px-8 py-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground">
                {projectName}
                {pageTitle && ` - ${pageTitle}`}
              </h1>
              {badge}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          {actions}
          {actionLabel && onAction && (
            <Button className="gap-2" onClick={onAction}>
              {actionIcon}
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
