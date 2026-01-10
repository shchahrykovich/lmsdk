/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AddLogsToDatasetDialog } from "@/components/AddLogsToDatasetDialog";
import { LogContent } from "./LogDetailDrawer/LogContent";

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
  projectId?: number;
}>;

export default function LogDetailDrawer({
  open,
  onClose,
  log,
  files,
  loading,
  projectSlug,
  projectId,
}: LogDetailDrawerProps): React.ReactNode {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      );
    }

    if (!log) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">No log selected</div>
        </div>
      );
    }

    return (
      <LogContent
        log={log}
        files={files}
        projectSlug={projectSlug}
        projectId={projectId}
        onAddToDataset={() => setIsAddDialogOpen(true)}
      />
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {renderContent()}
        </SheetContent>
      </Sheet>

      {projectId && log && (
        <AddLogsToDatasetDialog
          projectId={projectId}
          logIds={[log.id]}
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
        />
      )}
    </>
  );
}
