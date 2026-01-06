/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import JsonView from "@uiw/react-json-view";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import { Button } from "@/components/ui/button";

interface Evaluation {
  id: number;
  tenantId: number;
  projectId: number;
  name: string;
  slug: string;
  type: string;
  state: string;
  durationMs: number | null;
  inputSchema: string;
  outputSchema: string;
  createdAt: string;
  updatedAt: string;
}

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

interface EvaluationDetails {
  evaluation: Evaluation;
  prompts: Prompt[];
  results: ResultRow[];
}

interface Project {
  id: number;
  name: string;
  slug: string;
  tenantId: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

export default function EvaluationDetail(): React.ReactNode {
  const { slug, evaluationId } = useParams<{ slug: string; evaluationId: string }>();
  const [details, setDetails] = useState<EvaluationDetails | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchData();
  }, [slug, evaluationId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const projectsResponse = await fetch("/api/projects");
      if (!projectsResponse.ok) {
        throw new Error(`Failed to fetch projects: ${projectsResponse.statusText}`);
      }
      const projectsData = await projectsResponse.json();
      const foundProject = projectsData.projects.find((p: Project) => p.slug === slug);

      if (!foundProject) {
        setError("Project not found");
        setLoading(false);
        return;
      }

      setProject(foundProject);

      const detailsResponse = await fetch(
        `/api/projects/${foundProject.id}/evaluations/${evaluationId}`
      );
      if (!detailsResponse.ok) {
        throw new Error(`Failed to fetch evaluation details: ${detailsResponse.statusText}`);
      }
      const detailsData = await detailsResponse.json();
      setDetails(detailsData);
    } catch (error) {
      console.error("Error fetching evaluation details:", error);
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const parseJSON = (jsonString: string) => {
    try {
      return JSON.parse(jsonString);
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
      // If the result has a content field, extract it
      if (parsed && typeof parsed === "object" && "content" in parsed) {
        return parsed.content;
      }
      return parsed;
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !project || !details) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error ?? "Evaluation not found"}</div>
      </div>
    );
  }

  const { evaluation, prompts, results } = details;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle={`Evaluation: ${evaluation.name}`}
        description={`State: ${evaluation.state} | Type: ${evaluation.type}`}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {results.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-lg font-semibold text-foreground">No results yet</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Results will appear here once the evaluation completes.
            </p>
          </div>
        ) : (
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
                    const variables = parseJSON(row.variables);
                    return (
                      <tr key={row.recordId} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-4 align-top">
                          <div className="overflow-hidden">
                            <JsonView
                              value={variables}
                              collapsed={2}
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

                          // Extract content from the result
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
                                    value={typeof content === "string" ? parseJSON(content) : content}
                                    collapsed={3}
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
        )}
      </div>
    </div>
  );
}
