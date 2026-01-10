/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useNavigate } from "react-router-dom";
import { MoreVertical } from "lucide-react";
import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LogHeaderProps = Readonly<{
  logId: number;
  promptName: string | null;
  promptSlug: string | null;
  version: number;
  provider?: string | null;
  model?: string | null;
  projectSlug?: string;
  projectId?: number;
  onAddToDataset: () => void;
}>;

export function LogHeader({
  logId,
  promptName,
  promptSlug,
  version,
  provider,
  model,
  projectSlug,
  projectId,
  onAddToDataset,
}: LogHeaderProps): React.ReactNode {
  const navigate = useNavigate();

  return (
    <SheetHeader>
      <div className="flex items-center gap-2">
        <SheetTitle>
          {projectSlug ? (
            <a
              href={`/projects/${projectSlug}/logs/${logId}`}
              onClick={(e) => {
                // Allow browser default behavior for Cmd/Ctrl+Click
                if (e.metaKey || e.ctrlKey) {
                  return;
                }
                e.preventDefault();
                void navigate(`/projects/${projectSlug}/logs/${logId}`);
              }}
              className="hover:text-primary hover:underline"
            >
              Log #{logId}
            </a>
          ) : (
            <span>Log #{logId}</span>
          )}
        </SheetTitle>
        {projectId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={onAddToDataset}>
                Add to dataset
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <SheetDescription>
        {promptSlug && projectSlug ? (
          <a
            href={`/projects/${projectSlug}/prompts/${promptSlug}`}
            onClick={(e) => {
              // Allow browser default behavior for Cmd/Ctrl+Click
              if (e.metaKey || e.ctrlKey) {
                return;
              }
              e.preventDefault();
              void navigate(`/projects/${projectSlug}/prompts/${promptSlug}`);
            }}
            className="hover:text-primary hover:underline"
          >
            {promptName ?? "Unknown prompt"}
          </a>
        ) : (
          <span>{promptName ?? "Unknown prompt"}</span>
        )}
        {" "}v{version}
        {provider && model && ` - ${provider}/${model}`}
      </SheetDescription>
    </SheetHeader>
  );
}
