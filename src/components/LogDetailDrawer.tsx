/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Clock, Timer, CheckCircle2, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import JsonSection from "@/components/JsonSection";

interface LogEntry {
  id: number;
  promptId: number;
  version: number;
  logPath: string | null;
  isSuccess: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: number | string;
  promptName: string | null;
  promptSlug: string | null;
  provider?: string | null;
  model?: string | null;
}

interface LogFiles {
  metadata: unknown | null;
  input: unknown | null;
  output: unknown | null;
  result: unknown | null;
  response: unknown | null;
  variables: unknown | null;
}

type LogDetailDrawerProps = Readonly<{
  open: boolean;
  onClose: () => void;
  log: LogEntry | null;
  files: LogFiles | null;
  loading: boolean;
  projectSlug?: string;
}>;

export default function LogDetailDrawer({
  open,
  onClose,
  log,
  files,
  loading,
  projectSlug,
}: LogDetailDrawerProps): React.ReactNode {
  const navigate = useNavigate();

  const formatDateTime = (value: string | number) => {
    const timestamp =
      typeof value === "number" && value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(timestamp).toLocaleString();
  };

  let content: React.ReactNode;

  if (loading) {
    content = (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  } else if (!log) {
    content = (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">No log selected</div>
      </div>
    );
  } else {
    content = (
      <>
        <SheetHeader>
          <SheetTitle>Log #{log.id}</SheetTitle>
          <SheetDescription>
            {log.promptSlug && projectSlug ? (
              <a
                href={`/projects/${projectSlug}/prompts/${log.promptSlug}`}
                onClick={(e) => {
                  // Allow browser default behavior for Cmd/Ctrl+Click
                  if (e.metaKey || e.ctrlKey) {
                    return;
                  }
                  e.preventDefault();
                  void navigate(`/projects/${projectSlug}/prompts/${log.promptSlug}`);
                }}
                className="hover:text-primary hover:underline"
              >
                {log.promptName ?? "Unknown prompt"}
              </a>
            ) : (
              <span>{log.promptName ?? "Unknown prompt"}</span>
            )}
            {" "}v{log.version}
            {log.provider && log.model && ` - ${log.provider}/${log.model}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3 mb-3">
              {log.isSuccess ? (
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Success</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Error</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" />
                <span>
                  {typeof log.durationMs === "number"
                    ? `${log.durationMs} ms`
                    : "Duration unavailable"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatDateTime(log.createdAt)}</span>
              </div>
            </div>
            {log.errorMessage && (
              <div className="text-sm text-red-500 mt-3 whitespace-pre-wrap">
                {log.errorMessage}
              </div>
            )}
          </div>

          <JsonSection title="Variables" data={files?.variables} collapsed={false} compact contextTitle={log.promptName ?? undefined} logId={log.id} />
          <JsonSection title="Response" data={files?.response} collapsed={false} compact contextTitle={log.promptName ?? undefined} logId={log.id} />
          <JsonSection title="Result" data={files?.result} collapsed={2} compact contextTitle={log.promptName ?? undefined} logId={log.id} />
          <JsonSection title="Input" data={files?.input} collapsed={2} compact contextTitle={log.promptName ?? undefined} logId={log.id} />
          <JsonSection title="Output" data={files?.output} collapsed={2} compact contextTitle={log.promptName ?? undefined} logId={log.id} />
        </div>
      </>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {content}
      </SheetContent>
    </Sheet>
  );
}
