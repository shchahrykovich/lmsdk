import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface ProjectPageHeaderProps {
  projectName: string;
  pageTitle?: string;
  description: string | ReactNode;
  onBack: () => void;
  actionIcon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  badge?: ReactNode;
}

export default function ProjectPageHeader({
  projectName,
  pageTitle,
  description,
  onBack,
  actionIcon,
  actionLabel,
  onAction,
  badge,
}: ProjectPageHeaderProps) {
  return (
    <div className="border-b border-border bg-card shrink-0">
      <div className="px-8 py-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft size={18} />
          </Button>
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
