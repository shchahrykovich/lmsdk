import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  actionIcon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export default function PageHeader({
  title,
  description,
  actionIcon,
  actionLabel,
  onAction,
}: PageHeaderProps) {
  return (
    <div className="border-b border-border bg-card shrink-0">
      <div className="px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
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
