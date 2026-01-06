/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ResponseType = "text" | "json";
type ReasoningEffort = "low" | "medium" | "high";
type ReasoningSummary = "auto" | "enabled" | "disabled";
type ThinkingLevel =
  | "THINKING_LEVEL_UNSPECIFIED"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "MINIMAL";

type PromptConfigurationPanelProps = Readonly<{
  saveError: string | null;
  responseType: ResponseType;
  setResponseType: (value: ResponseType) => void;
  onEditSchema: () => void;
  provider: string;
  systemMessage: string;
  setSystemMessage: (value: string) => void;
  userMessage: string;
  setUserMessage: (value: string) => void;
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (value: ReasoningEffort) => void;
  reasoningSummary: ReasoningSummary;
  setReasoningSummary: (value: ReasoningSummary) => void;
  storeEnabled: boolean;
  setStoreEnabled: (value: boolean) => void;
  includeEncryptedReasoning: boolean;
  setIncludeEncryptedReasoning: (value: boolean) => void;
  includeThoughts: boolean;
  setIncludeThoughts: (value: boolean) => void;
  thinkingBudget: number;
  setThinkingBudget: (value: number) => void;
  thinkingLevel: ThinkingLevel;
  setThinkingLevel: (value: ThinkingLevel) => void;
  googleSearchEnabled: boolean;
  setGoogleSearchEnabled: (value: boolean) => void;
  cacheSystemMessage: boolean;
  setCacheSystemMessage: (value: boolean) => void;
}>;

export function PromptConfigurationPanel({
  saveError,
  responseType,
  setResponseType,
  onEditSchema,
  provider,
  systemMessage,
  setSystemMessage,
  userMessage,
  setUserMessage,
  reasoningEffort,
  setReasoningEffort,
  reasoningSummary,
  setReasoningSummary,
  storeEnabled,
  setStoreEnabled,
  includeEncryptedReasoning,
  setIncludeEncryptedReasoning,
  includeThoughts,
  setIncludeThoughts,
  thinkingBudget,
  setThinkingBudget,
  thinkingLevel,
  setThinkingLevel,
  googleSearchEnabled,
  setGoogleSearchEnabled,
  cacheSystemMessage,
  setCacheSystemMessage,
}: PromptConfigurationPanelProps): React.ReactNode {
  return (
    <div className="w-1/2 border-r border-border overflow-y-auto">
      <div className="p-6 space-y-4">
        {saveError && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Response Format */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Response format
            </Label>
            <div className="flex items-center gap-2">
              <Select
                value={responseType}
                onValueChange={(value: ResponseType) => setResponseType(value)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="json">JSON Schema</SelectItem>
                </SelectContent>
              </Select>
              {responseType === "json" && (
                <Button variant="outline" size="sm" onClick={onEditSchema}>
                  Edit Schema
                </Button>
              )}
            </div>
          </div>

          {/* OpenAI-specific Settings */}
          {provider === "openai" && (
            <>
              <div className="relative"></div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Reasoning Effort */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Reasoning Effort
                    </Label>
                    <Select
                      value={reasoningEffort}
                      onValueChange={(value: "low" | "medium" | "high") =>
                        setReasoningEffort(value)
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Reasoning Summary */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Reasoning Summary
                    </Label>
                    <Select
                      value={reasoningSummary}
                      onValueChange={(value: "auto" | "enabled" | "disabled") =>
                        setReasoningSummary(value)
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="enabled">Enabled</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Store */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={storeEnabled}
                      onChange={(event) => setStoreEnabled(event.target.checked)}
                      className="w-4 h-4 rounded border-input"
                    />
                    <span className="text-xs text-muted-foreground">
                      Store conversations
                    </span>
                  </label>

                  {/* Include Encrypted Reasoning */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeEncryptedReasoning}
                      onChange={(event) =>
                        setIncludeEncryptedReasoning(event.target.checked)
                      }
                      className="w-4 h-4 rounded border-input"
                    />
                    <span className="text-xs text-muted-foreground">
                      Include encrypted reasoning
                    </span>
                  </label>
                </div>
              </div>
              <div className="relative"></div>
            </>
          )}

          {/* Google-specific Settings */}
          {provider === "google" && (
            <>
              <div className="relative"></div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-md p-2">
                    <p className="text-[10px] text-amber-800 dark:text-amber-400">
                      Note: Use either Thinking Budget (for token control) OR
                      Thinking Level (for quality preset), not both.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Thinking Budget - Only show when thinking level is unspecified */}
                    {thinkingLevel === "THINKING_LEVEL_UNSPECIFIED" && (
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Thinking Budget (tokens)
                        </Label>
                        <input
                          type="number"
                          value={thinkingBudget}
                          onChange={(event) => {
                            const value = parseInt(event.target.value) || 0;
                            setThinkingBudget(value);
                          }}
                          placeholder="0 (disabled)"
                          className="w-full h-8 px-3 text-sm rounded-md border border-input bg-background"
                        />
                        <span className="text-[10px] text-muted-foreground mt-0.5 block">
                          0 = disabled (uses level instead)
                        </span>
                      </div>
                    )}

                    {/* Thinking Level */}
                    <div
                      className={
                        thinkingLevel === "THINKING_LEVEL_UNSPECIFIED"
                          ? ""
                          : "col-span-2"
                      }
                    >
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        Thinking Level
                      </Label>
                      <Select
                        value={thinkingLevel}
                        onValueChange={(
                          value:
                            | "THINKING_LEVEL_UNSPECIFIED"
                            | "LOW"
                            | "MEDIUM"
                            | "HIGH"
                            | "MINIMAL"
                        ) => {
                          setThinkingLevel(value);
                          // If setting a specific level, clear thinking budget
                          if (value !== "THINKING_LEVEL_UNSPECIFIED") {
                            setThinkingBudget(0);
                          }
                        }}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="THINKING_LEVEL_UNSPECIFIED">
                            Unspecified
                          </SelectItem>
                          <SelectItem value="MINIMAL">Minimal</SelectItem>
                          <SelectItem value="LOW">Low</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="HIGH">High</SelectItem>
                        </SelectContent>
                      </Select>
                      {thinkingLevel === "THINKING_LEVEL_UNSPECIFIED" && (
                        <span className="text-[10px] text-muted-foreground mt-0.5 block">
                          Active when budget is 0
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {/* Include Thoughts */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeThoughts}
                      onChange={(event) =>
                        setIncludeThoughts(event.target.checked)
                      }
                      className="w-4 h-4 rounded border-input"
                    />
                    <span className="text-xs text-muted-foreground">
                      Include thoughts in response
                    </span>
                  </label>

                  {/* Google Search Tool */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={googleSearchEnabled}
                      onChange={(event) =>
                        setGoogleSearchEnabled(event.target.checked)
                      }
                      className="w-4 h-4 rounded border-input"
                    />
                    <span className="text-xs text-muted-foreground">
                      Enable Google Search tool
                    </span>
                  </label>

                  {/* Cache System Message */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cacheSystemMessage}
                      onChange={(event) =>
                        setCacheSystemMessage(event.target.checked)
                      }
                      className="w-4 h-4 rounded border-input"
                    />
                    <span className="text-xs text-muted-foreground">
                      Cache system message
                    </span>
                  </label>
                </div>
              </div>
              <div className="relative"></div>
            </>
          )}

          {/* System Message */}
          {provider !== "openai" && <div className="relative"></div>}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              System message
            </Label>
            <textarea
              className="w-full min-h-[120px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-y"
              placeholder="You are a helpful assistant..."
              value={systemMessage}
              onChange={(event) => setSystemMessage(event.target.value)}
            />
          </div>

          {/* User Message */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              User message
            </Label>
            <textarea
              className="w-full min-h-[120px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-y"
              placeholder="Hello! How can you help me today?"
              value={userMessage}
              onChange={(event) => setUserMessage(event.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
