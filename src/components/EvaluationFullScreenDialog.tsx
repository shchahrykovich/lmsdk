import type { JSX } from "react";
import { useEffect, useState, useMemo } from "react";
import JsonView from "@uiw/react-json-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { normalizeOutput, generateDiffHtml } from "@/lib/diff-utils";
import "diff2html/bundles/css/diff2html.min.css";

interface Prompt {
  promptId: number;
  versionId: number;
  version: number;
  promptName: string;
  responseFormat: string | null;
}

interface ResultOutput {
  promptId: number;
  versionId: number;
  result: string;
  durationMs: number | null;
}

interface ResultRow {
  recordId: number;
  variables: string;
  outputs: ResultOutput[];
}

interface EvaluationFullScreenDialogProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentRecordIndex: number;
  readonly setCurrentRecordIndex: (index: number) => void;
  readonly results: ResultRow[];
  readonly prompts: Prompt[];
}

export default function EvaluationFullScreenDialog({
  isOpen,
  onOpenChange,
  currentRecordIndex,
  setCurrentRecordIndex,
  results,
  prompts,
}: EvaluationFullScreenDialogProps): JSX.Element {
  const [activeComparison, setActiveComparison] = useState(0);

  const comparisonPairs = useMemo(() => {
    if (prompts.length === 2) return [[0, 1]];
    if (prompts.length === 3) return [[0, 1], [1, 2], [0, 2]];
    return [];
  }, [prompts.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && currentRecordIndex > 0) {
        setCurrentRecordIndex(currentRecordIndex - 1);
      } else if (e.key === "ArrowRight" && currentRecordIndex < results.length - 1) {
        setCurrentRecordIndex(currentRecordIndex + 1);
      } else if (e.key === "Tab" && comparisonPairs.length > 1) {
        e.preventDefault();
        setActiveComparison((prev) => (prev + 1) % comparisonPairs.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentRecordIndex, results.length, setCurrentRecordIndex, comparisonPairs.length]);

  const sortObjectKeys = (obj: unknown): unknown => {
    if (obj === null || obj === undefined) {
      return obj as null | undefined;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => sortObjectKeys(item)) as unknown[];
    }

    if (typeof obj === 'object') {
      return Object.keys(obj)
        .sort((a, b) => a.localeCompare(b))
        .reduce((sorted, key) => {
          sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
          return sorted;
        }, {} as Record<string, unknown>) as Record<string, unknown>;
    }

    return obj as unknown;
  };

  const parseJSON = (jsonString: string): unknown => {
    try {
      const parsed = JSON.parse(jsonString);
      return sortObjectKeys(parsed);
    } catch {
      return jsonString;
    }
  };

  const extractContent = (resultString: string) => {
    try {
      const parsed = JSON.parse(resultString);
      if (parsed && typeof parsed === "object" && "content" in parsed) {
        return sortObjectKeys(parsed.content);
      }
      return sortObjectKeys(parsed);
    } catch {
      return resultString;
    }
  };

const formatDuration = (durationMs: number | null): string => {
    if (durationMs === null) return "N/A";
    if (durationMs < 1000) return `${durationMs} ms`;
    return `${(durationMs / 1000).toFixed(2)} s`;
  };

  const getOutputForPrompt = (outputs: ResultOutput[], promptId: number, versionId: number) => {
    return outputs.find((o) => o.promptId === promptId && o.versionId === versionId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>
              Record {currentRecordIndex + 1} of {results.length}.{" "}
              {prompts.map((p) => `${p.promptName} (v${p.version})`).join(" vs ")}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentRecordIndex(currentRecordIndex - 1)}
                disabled={currentRecordIndex === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentRecordIndex(currentRecordIndex + 1)}
                disabled={currentRecordIndex === results.length - 1}
              >
                Next
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
{results.length > 0 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Input Variables</h3>
              <div className="border border-border rounded-lg p-4 bg-card">
                <JsonView
                  value={parseJSON(results[currentRecordIndex].variables) ?? {}}
                  collapsed={false}
                  style={{ fontSize: "0.875rem" }}
                  displayDataTypes={false}
                />
              </div>
            </div>

            {prompts.length === 1 && (
              <div className="border border-border rounded-lg p-4 bg-card">
                <p className="text-sm text-muted-foreground text-center py-8">
                  ℹ️ Add another prompt to enable comparison
                </p>
              </div>
            )}

            {comparisonPairs.length > 0 && (
              <div className="space-y-4">
                {comparisonPairs.length > 1 && (
                  <div className="flex gap-2">
                    {comparisonPairs.map((pair, index) => {
                      const [leftIdx, rightIdx] = pair;
                      const leftPrompt = prompts[leftIdx];
                      const rightPrompt = prompts[rightIdx];
                      return (
                        <Button
                          key={index}
                          variant={activeComparison === index ? "default" : "outline"}
                          size="sm"
                          onClick={() => setActiveComparison(index)}
                        >
                          {leftPrompt.promptName} vs {rightPrompt.promptName}
                        </Button>
                      );
                    })}
                  </div>
                )}

                {(() => {
                  const [leftIdx, rightIdx] = comparisonPairs[activeComparison];
                  const leftPrompt = prompts[leftIdx];
                  const rightPrompt = prompts[rightIdx];
                  const leftOutput = getOutputForPrompt(
                    results[currentRecordIndex].outputs,
                    leftPrompt.promptId,
                    leftPrompt.versionId
                  );
                  const rightOutput = getOutputForPrompt(
                    results[currentRecordIndex].outputs,
                    rightPrompt.promptId,
                    rightPrompt.versionId
                  );

                  if (!leftOutput || !rightOutput) {
                    return (
                      <div className="border border-border rounded-lg p-4 bg-card">
                        <p className="text-sm text-muted-foreground text-center py-8">
                          Missing output data for comparison
                        </p>
                      </div>
                    );
                  }

                  const leftContent = normalizeOutput(extractContent(leftOutput.result));
                  const rightContent = normalizeOutput(extractContent(rightOutput.result));
                  const diffHtml = generateDiffHtml(
                    leftContent,
                    rightContent,
                    `${leftPrompt.promptName} (v${leftPrompt.version})`,
                    `${rightPrompt.promptName} (v${rightPrompt.version})`
                  );

                  return (
                    <div className="space-y-2">
                      <div className="border border-border rounded-lg overflow-hidden bg-card">
                        <div
                          className="diff-container"
                          dangerouslySetInnerHTML={{ __html: diffHtml }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground px-2">
                        <span>
                          {leftPrompt.promptName} (v{leftPrompt.version}):{" "}
                          {formatDuration(leftOutput.durationMs)}
                        </span>
                        <span>
                          {rightPrompt.promptName} (v{rightPrompt.version}):{" "}
                          {formatDuration(rightOutput.durationMs)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
