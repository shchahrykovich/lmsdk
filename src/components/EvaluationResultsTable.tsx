import {type JSX, useState} from "react";
import JsonView from "@uiw/react-json-view";
import { Button } from "@/components/ui/button";

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

interface EvaluationResultsTableProps {
  readonly prompts: Prompt[];
  readonly results: ResultRow[];
  readonly jsonCollapsed: boolean | number;
}

function TextContent({ text }: { readonly text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const MAX_LENGTH = 200;
  const needsTruncation = text.length > MAX_LENGTH;

  return (
    <div className="text-sm text-foreground">
      <div className="whitespace-pre-wrap break-words">
        {isExpanded || !needsTruncation ? text : `${text.slice(0, MAX_LENGTH)}...`}
      </div>
      {needsTruncation && (
        <Button
          variant="link"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 h-auto p-0 text-xs"
        >
          {isExpanded ? "Show less" : "Read more"}
        </Button>
      )}
    </div>
  );
}

export default function EvaluationResultsTable({
  prompts,
  results,
  jsonCollapsed,
}: EvaluationResultsTableProps): JSX.Element {
  const sortObjectKeys = (obj: unknown): unknown => {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => sortObjectKeys(item));
    }

    if (typeof obj === 'object') {
      return Object.keys(obj)
        .sort((a, b) => a.localeCompare(b))
        .reduce((sorted, key) => {
          sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
          return sorted;
        }, {} as Record<string, unknown>);
    }

    return obj;
  };

  const parseJSON = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      return sortObjectKeys(parsed);
    } catch {
      return jsonString;
    }
  };

  const getOutputForPrompt = (outputs: ResultOutput[], promptId: number, versionId: number) => {
    return outputs.find((o) => o.promptId === promptId && o.versionId === versionId);
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

  const isJSONResponse = (responseFormat: string | null): boolean => {
    if (!responseFormat) return false;
    try {
      const format = JSON.parse(responseFormat);
      return format.type === "json" || format.type === "json_schema";
    } catch {
      return false;
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-64">
                Input
              </th>
              {prompts.map((prompt) => (
                <th
                  key={`${prompt.promptId}-${prompt.versionId}`}
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  {prompt.promptName}
                  <div className="text-xs font-normal normal-case text-muted-foreground/70 mt-1">
                    v{prompt.version}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {results.map((row) => {
              const variables = parseJSON(row.variables) ?? {};
              return (
                <tr key={row.recordId} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-4 align-top">
                    <div className="overflow-hidden">
                      <JsonView
                        value={variables}
                        collapsed={jsonCollapsed}
                        style={{ fontSize: "0.75rem" }}
                        displayDataTypes={false}
                      />
                    </div>
                  </td>
                  {prompts.map((prompt) => {
                    const output = getOutputForPrompt(
                      row.outputs,
                      prompt.promptId,
                      prompt.versionId
                    );
                    if (!output) {
                      return (
                        <td
                          key={`${prompt.promptId}-${prompt.versionId}`}
                          className="px-4 py-4 align-top"
                        >
                          <div className="text-sm text-muted-foreground">—</div>
                        </td>
                      );
                    }

                    const content = extractContent(output.result);
                    const isJSON = isJSONResponse(prompt.responseFormat);

                    return (
                      <td
                        key={`${prompt.promptId}-${prompt.versionId}`}
                        className="px-4 py-4 align-top"
                      >
                        <div className="overflow-hidden">
                          {isJSON ? (
                            <JsonView
                              value={(typeof content === "string" ? parseJSON(content) : content) ??  {}}
                              collapsed={jsonCollapsed}
                              style={{ fontSize: "0.75rem" }}
                              displayDataTypes={false}
                            />
                          ) : (
                            <TextContent text={String(content)} />
                          )}
                          {output.durationMs !== null && (
                            <div className="text-xs text-muted-foreground mt-2">
                              {output.durationMs < 1000
                                ? `${output.durationMs} ms`
                                : `${(output.durationMs / 1000).toFixed(2)} s`}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
