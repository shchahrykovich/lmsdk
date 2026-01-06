/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import JsonView from "@uiw/react-json-view";

type ResponseType = "text" | "json";
type ReasoningEffort = "low" | "medium" | "high";
type ReasoningSummary = "auto" | "enabled" | "disabled";
type ThinkingLevel =
  | "THINKING_LEVEL_UNSPECIFIED"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "MINIMAL";

const getUsageNumber = (usage: Record<string, unknown>, key: string): number => {
  const value = usage[key];
  return typeof value === "number" ? value : 0;
};

type PromptTestingPanelProps = Readonly<{
  variables: Record<string, string>;
  setVariables: Dispatch<SetStateAction<Record<string, string>>>;
  provider: string;
  model: string;
  proxy: "none" | "cloudflare";
  responseType: ResponseType;
  jsonSchema: string;
  systemMessage: string;
  userMessage: string;
  reasoningEffort: ReasoningEffort;
  reasoningSummary: ReasoningSummary;
  storeEnabled: boolean;
  includeEncryptedReasoning: boolean;
  includeThoughts: boolean;
  thinkingBudget: number;
  thinkingLevel: ThinkingLevel;
  googleSearchEnabled: boolean;
  cacheSystemMessage: boolean;
  projectId: number;
  promptSlug: string;
  testOutput: string;
  setTestOutput: (value: string) => void;
  isTesting: boolean;
  setIsTesting: (value: boolean) => void;
}>;

export function PromptTestingPanel({
  variables,
  setVariables,
  provider,
  model,
  proxy,
  responseType,
  jsonSchema,
  systemMessage,
  userMessage,
  reasoningEffort,
  reasoningSummary,
  storeEnabled,
  includeEncryptedReasoning,
  includeThoughts,
  thinkingBudget,
  thinkingLevel,
  googleSearchEnabled,
  cacheSystemMessage,
  projectId,
  promptSlug,
  testOutput,
  setTestOutput,
  isTesting,
  setIsTesting,
}: PromptTestingPanelProps): React.ReactNode {
  const buildMessages = () => {
    const messages = [];
    if (systemMessage.trim()) {
      messages.push({ role: "system", content: systemMessage });
    }
    if (userMessage.trim()) {
      messages.push({ role: "user", content: userMessage });
    }
    return messages;
  };

  const buildResponseFormat = () => {
    if (responseType !== "json" || !jsonSchema.trim()) {
      return { responseFormat: { type: "text" as const } };
    }

    try {
      const parsedSchema = JSON.parse(jsonSchema);
      return {
        responseFormat: {
          type: "json_schema" as const,
          json_schema: parsedSchema,
        },
      };
    } catch {
      return { error: "Invalid JSON schema format" };
    }
  };

  const formatUsage = (usage: Record<string, unknown> | null | undefined) => {
    if (!usage) {
      return "N/A";
    }

    const parts = [
      `Prompt: ${getUsageNumber(usage, "prompt_tokens")}`,
      `Completion: ${getUsageNumber(usage, "completion_tokens")}`,
    ];

    const thoughtsTokens = getUsageNumber(usage, "thoughts_tokens");
    if (thoughtsTokens > 0) {
      parts.push(`Thinking: ${thoughtsTokens}`);
    }

    const toolUseTokens = getUsageNumber(usage, "tool_use_prompt_tokens");
    if (toolUseTokens > 0) {
      parts.push(`Tool Use: ${toolUseTokens}`);
    }

    const cachedTokens = getUsageNumber(usage, "cached_content_tokens");
    if (cachedTokens > 0) {
      parts.push(`Cached: ${cachedTokens}`);
    }

    parts.push(`Total: ${getUsageNumber(usage, "total_tokens")}`);
    return parts.join(" | ");
  };

  const getValidationError = () => {
    if (!provider.trim() || !model.trim()) {
      return "Provider and model must be selected";
    }
    if (!systemMessage.trim() && !userMessage.trim()) {
      return "At least one message is required";
    }
    return null;
  };

  const applyProviderSettings = (requestBody: Record<string, unknown>) => {
    if (provider === "openai") {
      requestBody.openai_settings = {
        reasoning_effort: reasoningEffort,
        reasoning_summary: reasoningSummary,
        store: storeEnabled,
        include_encrypted_reasoning: includeEncryptedReasoning,
      };
    }

    if (provider === "google") {
      requestBody.google_settings = {
        include_thoughts: includeThoughts,
        thinking_budget: thinkingBudget,
        thinking_level: thinkingLevel,
        google_search_enabled: googleSearchEnabled,
        cache_system_message: cacheSystemMessage,
      };
    }
  };

  const handleRunTest = async () => {
    try {
      setIsTesting(true);
      setTestOutput("");

      const validationError = getValidationError();
      if (validationError) {
        setTestOutput(`Error: ${validationError}`);
        return;
      }

      const messages = buildMessages();

      const requestBody: Record<string, unknown> = {
        provider,
        model,
        proxy,
        messages,
        variables, // Pass variables to backend for substitution
        projectId,
        promptSlug,
      };

      const responseFormat = buildResponseFormat();
      if ("error" in responseFormat) {
        setTestOutput(`Error: ${responseFormat.error}`);
        return;
      }
      requestBody.response_format = responseFormat.responseFormat;

      applyProviderSettings(requestBody);

      const response = await fetch("/api/providers/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        setTestOutput(`Error: ${data.error ?? "Failed to execute prompt"}`);
        return;
      }

      if (data.success && data.result) {
        const result = data.result;
        const usageText = formatUsage(result.usage);
        const durationMs =
          typeof result.duration_ms === "number" ? result.duration_ms : null;
        const durationText = durationMs !== null ? `${durationMs} ms` : "N/A";

        setTestOutput(
          `${result.content}\n\n---\nModel: ${result.model}\nTokens: ${usageText}\nExecution: ${durationText}`
        );
      } else {
        setTestOutput("Error: Unexpected response format");
      }
    } catch (err) {
      console.error("Error testing prompt:", err);
      setTestOutput(
        `Error: ${err instanceof Error ? err.message : "Failed to test prompt"}`
      );
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="w-1/2 overflow-y-auto bg-muted/20">
      <div className="p-6 space-y-4">
        {/* Variables */}
        {Object.keys(variables).length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs font-medium text-muted-foreground block">
              Variables
            </Label>
            {Object.keys(variables).map((varName) => (
              <div key={varName}>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  {varName}
                </Label>
                <input
                  type="text"
                  className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background"
                  placeholder={`Enter value for {{${varName}}}`}
                  value={variables[varName]}
                  onChange={(event) =>
                    setVariables((prev) => ({
                      ...prev,
                      [varName]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        )}
        {/* Run Test Button */}
        <div className="flex justify-end pt-2">
          <Button onClick={() => { void handleRunTest(); }} disabled={isTesting} size="sm">
            {isTesting ? "Running..." : "Run"}
          </Button>
        </div>

        {/* Test Output */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Output
          </Label>
          <div className="min-h-[200px] px-3 py-2 text-sm rounded-md border border-input bg-background">
            {testOutput ? (
              (() => {
                // If JSON schema is selected, try to parse and display as JSON
                if (responseType === "json") {
                  try {
                    // Extract the JSON content (everything before the metadata separator)
                    const parts = testOutput.split("\n\n---\n");
                    const jsonContent = parts[0];
                    const metadata = parts[1];

                    // Try to parse the JSON
                    const parsedJson = JSON.parse(jsonContent);

                    return (
                      <>
                        <JsonView value={parsedJson} collapsed={5} />
                        {metadata && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                              {metadata}
                            </p>
                          </div>
                        )}
                      </>
                    );
                  } catch {
                    // If parsing fails, display as plain text
                    return (
                      <p className="text-foreground whitespace-pre-wrap">
                        {testOutput}
                      </p>
                    );
                  }
                }
                // For text responses, display as plain text
                return (
                  <p className="text-foreground whitespace-pre-wrap">
                    {testOutput}
                  </p>
                );
              })()
            ) : (
              <p className="text-muted-foreground italic">
                {Object.keys(variables).length > 0
                  ? "Fill in variable values and run test..."
                  : "Run a test to see the output..."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
