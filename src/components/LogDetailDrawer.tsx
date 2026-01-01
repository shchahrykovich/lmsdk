import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Clock, Timer, CheckCircle2, AlertCircle } from "lucide-react";
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

interface LogDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  log: LogEntry | null;
  files: LogFiles | null;
  loading: boolean;
}

export default function LogDetailDrawer({
  open,
  onClose,
  log,
  files,
  loading,
}: LogDetailDrawerProps) {
  const formatDateTime = (value: string | number) => {
    const timestamp =
      typeof value === "number" && value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        ) : log ? (
          <>
            <SheetHeader>
              <SheetTitle>Log #{log.id}</SheetTitle>
              <SheetDescription>
                {log.promptName || "Unknown prompt"} v{log.version}
                {log.provider && log.model && ` - ${log.provider}/${log.model}`}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Summary */}
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

              {/*/!* Metadata *!/*/}
              {/*<div className="rounded-lg border border-border bg-card p-4 group">*/}
              {/*  <div className="flex items-center justify-between gap-3 mb-2">*/}
              {/*    <h3 className="text-sm font-semibold text-foreground">Metadata</h3>*/}
              {/*    <Button*/}
              {/*      variant="ghost"*/}
              {/*      size="sm"*/}
              {/*      className="h-7 text-xs opacity-0 transition-opacity group-hover:opacity-100"*/}
              {/*      onClick={() => copyToClipboard(files?.metadata ?? null)}*/}
              {/*    >*/}
              {/*      Copy*/}
              {/*    </Button>*/}
              {/*  </div>*/}
              {/*  <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">*/}
              {/*    {stringifyData(files?.metadata ?? null)}*/}
              {/*  </pre>*/}
              {/*</div>*/}

              <JsonSection title="Variables" data={files?.variables} collapsed={false} compact />
              <JsonSection title="Response" data={files?.response} collapsed={false} compact />
              <JsonSection title="Result" data={files?.result} collapsed={2} compact />
              <JsonSection title="Input" data={files?.input} collapsed={2} compact />
              <JsonSection title="Output" data={files?.output} collapsed={2} compact />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">No log selected</div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
