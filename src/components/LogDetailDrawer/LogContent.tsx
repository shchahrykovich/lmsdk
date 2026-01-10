/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import JsonSection from "@/components/JsonSection";
import { LogHeader } from "./LogHeader";
import { LogStatusSection } from "./LogStatusSection";

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

type LogContentProps = Readonly<{
  log: LogEntry;
  files: LogFiles | null;
  projectSlug?: string;
  projectId?: number;
  onAddToDataset: () => void;
}>;

export function LogContent({
  log,
  files,
  projectSlug,
  projectId,
  onAddToDataset,
}: LogContentProps): React.ReactNode {
  return (
    <>
      <LogHeader
        logId={log.id}
        promptName={log.promptName}
        promptSlug={log.promptSlug}
        version={log.version}
        provider={log.provider}
        model={log.model}
        projectSlug={projectSlug}
        projectId={projectId}
        onAddToDataset={onAddToDataset}
      />

      <div className="mt-6 space-y-6">
        <LogStatusSection
          isSuccess={log.isSuccess}
          durationMs={log.durationMs}
          createdAt={log.createdAt}
          errorMessage={log.errorMessage}
        />

        <JsonSection title="Variables" data={files?.variables} collapsed={false} compact contextTitle={log.promptName ?? undefined} logId={log.id} />
        <JsonSection title="Response" data={files?.response} collapsed={false} compact contextTitle={log.promptName ?? undefined} logId={log.id} />
        <JsonSection title="Result" data={files?.result} collapsed={2} compact contextTitle={log.promptName ?? undefined} logId={log.id} />
        <JsonSection title="Input" data={files?.input} collapsed={2} compact contextTitle={log.promptName ?? undefined} logId={log.id} />
        <JsonSection title="Output" data={files?.output} collapsed={2} compact contextTitle={log.promptName ?? undefined} logId={log.id} />
      </div>
    </>
  );
}
