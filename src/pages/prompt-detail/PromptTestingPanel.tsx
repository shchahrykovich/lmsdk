import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import JsonView from "@uiw/react-json-view";

interface PromptTestingPanelProps {
  variables: Record<string, string>;
  setVariables: Dispatch<SetStateAction<Record<string, string>>>;
  provider: string;
  model: string;
  proxy: "none" | "cloudflare";
  responseType: "text" | "json";
  jsonSchema: string;
  systemMessage: string;
  userMessage: string;
  reasoningEffort: "low" | "medium" | "high";
  reasoningSummary: "auto" | "enabled" | "disabled";
  storeEnabled: boolean;
  includeEncryptedReasoning: boolean;
  includeThoughts: boolean;
  thinkingBudget: number;
  thinkingLevel:
    | "THINKING_LEVEL_UNSPECIFIED"
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "MINIMAL";
  googleSearchEnabled: boolean;
  cacheSystemMessage: boolean;
  projectId: number;
  promptSlug: string;
  testOutput: string;
  setTestOutput: (value: string) => void;
  isTesting: boolean;
  setIsTesting: (value: boolean) => void;
}

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
}: PromptTestingPanelProps) {
  const handleRunTest = async () => {
    try {
      setIsTesting(true);
      setTestOutput("");

      // Validate
      if (!provider.trim() || !model.trim()) {
        setTestOutput("Error: Provider and model must be selected");
        return;
      }

      if (!systemMessage.trim() && !userMessage.trim()) {
        setTestOutput("Error: At least one message is required");
        return;
      }

      // Build messages array (without variable substitution - backend handles it)
      const messages = [
        systemMessage.trim() && {
          role: "system",
          content: systemMessage,
        },
        userMessage.trim() && {
          role: "user",
          content: userMessage,
        },
      ].filter(Boolean);

      // Build request body
      const requestBody: Record<string, unknown> = {
        provider,
        model,
        proxy,
        messages,
        variables, // Pass variables to backend for substitution
        projectId,
        promptSlug,
      };

      // Add response format if JSON schema is selected
      if (responseType === "json" && jsonSchema.trim()) {
        try {
          const parsedSchema = JSON.parse(jsonSchema);
          requestBody.response_format = {
            type: "json_schema",
            json_schema: parsedSchema,
          };
        } catch (err) {
          setTestOutput("Error: Invalid JSON schema format");
          return;
        }
      }

      // Add OpenAI-specific settings (only for openai provider)
      if (provider === "openai") {
        requestBody.openai_settings = {
          reasoning_effort: reasoningEffort,
          reasoning_summary: reasoningSummary,
          store: storeEnabled,
          include_encrypted_reasoning: includeEncryptedReasoning,
        };
      }

      // Add Google-specific settings (only for google provider)
      if (provider === "google") {
        requestBody.google_settings = {
          include_thoughts: includeThoughts,
          thinking_budget: thinkingBudget,
          thinking_level: thinkingLevel,
          google_search_enabled: googleSearchEnabled,
          cache_system_message: cacheSystemMessage,
        };
      }

      // Call the execute endpoint
      const response = await fetch("/api/providers/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        setTestOutput(`Error: ${data.error || "Failed to execute prompt"}`);
        return;
      }

      // Display the result
      if (data.success && data.result) {
        const result = data.result;
        const usage = result.usage;
        let usageText = "N/A";
        const durationMs =
          typeof result.duration_ms === "number" ? result.duration_ms : null;
        const durationText = durationMs !== null ? `${durationMs} ms` : "N/A";

        if (usage) {
          const parts = [
            `Prompt: ${usage.prompt_tokens || 0}`,
            `Completion: ${usage.completion_tokens || 0}`,
          ];

          // Add thinking tokens if present (for Google reasoning models)
          if (usage.thoughts_tokens && usage.thoughts_tokens > 0) {
            parts.push(`Thinking: ${usage.thoughts_tokens}`);
          }

          // Add tool use tokens if present (for Google tool use)
          if (usage.tool_use_prompt_tokens && usage.tool_use_prompt_tokens > 0) {
            parts.push(`Tool Use: ${usage.tool_use_prompt_tokens}`);
          }

          // Add cached tokens if present (for Google cached content)
          if (usage.cached_content_tokens && usage.cached_content_tokens > 0) {
            parts.push(`Cached: ${usage.cached_content_tokens}`);
          }

          parts.push(`Total: ${usage.total_tokens || 0}`);
          usageText = parts.join(" | ");
        }

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
          <Button onClick={handleRunTest} disabled={isTesting} size="sm">
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
