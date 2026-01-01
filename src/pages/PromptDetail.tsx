import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";

interface Prompt {
  id: number;
  projectId: number;
  tenantId: number;
  name: string;
  slug: string;
  provider: string;
  model: string;
  body: string;
  latestVersion: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: number;
  name: string;
  slug: string;
}

interface Provider {
  id: string;
  name: string;
  description: string;
  models: Array<{ id: string; name: string }>;
}

interface PromptVersion {
  id: number;
  promptId: number;
  tenantId: number;
  projectId: number;
  version: number;
  name: string;
  provider: string;
  model: string;
  body: string;
  slug: string;
  createdAt: string;
}

export default function PromptDetail() {
  const { slug: projectSlug, promptSlug } = useParams<{ slug: string; promptSlug: string }>();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form fields for OpenAI
  const [systemMessage, setSystemMessage] = useState("");
  const [userMessage, setUserMessage] = useState("");

  // Response format
  const [responseType, setResponseType] = useState<"text" | "json">("text");
  const [jsonSchema, setJsonSchema] = useState("");
  const [isSchemaDialogOpen, setIsSchemaDialogOpen] = useState(false);
  const [schemaEditValue, setSchemaEditValue] = useState("");

  // OpenAI-specific settings
  const [reasoningEffort, setReasoningEffort] = useState<"low" | "medium" | "high">("medium");
  const [reasoningSummary, setReasoningSummary] = useState<"auto" | "enabled" | "disabled">("auto");
  const [storeEnabled, setStoreEnabled] = useState(true);
  const [includeEncryptedReasoning, setIncludeEncryptedReasoning] = useState(true);

  // Google-specific settings
  const [includeThoughts, setIncludeThoughts] = useState(false);
  const [thinkingBudget, setThinkingBudget] = useState<number>(0);
  const [thinkingLevel, setThinkingLevel] = useState<"THINKING_LEVEL_UNSPECIFIED" | "LOW" | "MEDIUM" | "HIGH" | "MINIMAL">("THINKING_LEVEL_UNSPECIFIED");
  const [googleSearchEnabled, setGoogleSearchEnabled] = useState(false);

  // Test area
  const [testOutput, setTestOutput] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});

  // Version management
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [routerVersion, setRouterVersion] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, [projectSlug, promptSlug]);

  // Reset model when provider changes if the current model is not available
  useEffect(() => {
    if (provider && providers.length > 0) {
      const selectedProvider = providers.find((p) => p.id === provider);
      if (selectedProvider) {
        const modelExists = selectedProvider.models.some((m) => m.id === model);
        if (!modelExists && selectedProvider.models.length > 0) {
          // Auto-select first model if current model is not available
          setModel(selectedProvider.models[0].id);
        }
      }
    }
  }, [provider, providers]);

  // Extract variables from messages
  const extractVariables = (text: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = text.matchAll(regex);
    const vars = new Set<string>();
    for (const match of matches) {
      vars.add(match[1].trim());
    }
    return Array.from(vars);
  };

  // Get all variables from system and user messages
  const getAllVariables = (): string[] => {
    const systemVars = extractVariables(systemMessage);
    const userVars = extractVariables(userMessage);
    return [...new Set([...systemVars, ...userVars])];
  };

  // Update variables state when messages change
  useEffect(() => {
    const allVars = getAllVariables();
    setVariables((prev) => {
      const newVars: Record<string, string> = {};
      allVars.forEach((varName) => {
        newVars[varName] = prev[varName] || "";
      });
      return newVars;
    });
  }, [systemMessage, userMessage]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch providers
      const providersResponse = await fetch("/api/providers");
      if (providersResponse.ok) {
        const providersData = await providersResponse.json();
        setProviders(providersData.providers || []);
      }

      // Fetch project first
      const projectsResponse = await fetch("/api/projects");
      if (!projectsResponse.ok) {
        throw new Error(`Failed to fetch projects: ${projectsResponse.statusText}`);
      }
      const projectsData = await projectsResponse.json();
      const foundProject = projectsData.projects.find((p: Project) => p.slug === projectSlug);

      if (!foundProject) {
        setError("Project not found");
        setLoading(false);
        return;
      }

      setProject(foundProject);

      // Fetch prompts for this project
      const promptsResponse = await fetch(`/api/projects/${foundProject.id}/prompts`);
      if (!promptsResponse.ok) {
        throw new Error(`Failed to fetch prompts: ${promptsResponse.statusText}`);
      }
      const promptsData = await promptsResponse.json();
      const foundPrompt = promptsData.prompts.find((p: Prompt) => p.slug === promptSlug);

      if (!foundPrompt) {
        setError("Prompt not found");
      } else {
        setPrompt(foundPrompt);
        // Initialize editable fields
        setProvider(foundPrompt.provider);
        setModel(foundPrompt.model);

        // Fetch all versions for this prompt
        const versionsResponse = await fetch(`/api/projects/${foundProject.id}/prompts/${foundPrompt.id}/versions`);
        if (versionsResponse.ok) {
          const versionsData = await versionsResponse.json();
          setVersions(versionsData.versions || []);
        }

        // Fetch the active router version
        const routerResponse = await fetch(`/api/projects/${foundProject.id}/prompts/${foundPrompt.id}/router`);
        if (routerResponse.ok) {
          const routerData = await routerResponse.json();
          setRouterVersion(routerData.routerVersion);
        }

        // Set selected version to latest if not already set
        if (selectedVersion === null) {
          setSelectedVersion(foundPrompt.latestVersion);
        }

        // Parse body to populate form fields
        try {
          const parsedBody = JSON.parse(foundPrompt.body);
          if (parsedBody.messages && Array.isArray(parsedBody.messages)) {
            const systemMsg = parsedBody.messages.find((m: { role: string }) => m.role === "system");
            const userMsg = parsedBody.messages.find((m: { role: string }) => m.role === "user");
            if (systemMsg) setSystemMessage(systemMsg.content || "");
            if (userMsg) setUserMessage(userMsg.content || "");
          }
          // Load response format
          if (parsedBody.response_format) {
            if (parsedBody.response_format.type === "json_schema") {
              setResponseType("json");
              if (parsedBody.response_format.json_schema) {
                setJsonSchema(JSON.stringify(parsedBody.response_format.json_schema, null, 2));
              }
            } else {
              setResponseType("text");
            }
          } else {
            setResponseType("text");
          }
          // Load OpenAI-specific settings (only for openai provider)
          if (parsedBody.openai_settings) {
            if (parsedBody.openai_settings.reasoning_effort) {
              setReasoningEffort(parsedBody.openai_settings.reasoning_effort);
            }
            if (parsedBody.openai_settings.reasoning_summary) {
              setReasoningSummary(parsedBody.openai_settings.reasoning_summary);
            }
            if (parsedBody.openai_settings.store !== undefined) {
              setStoreEnabled(parsedBody.openai_settings.store);
            }
            if (parsedBody.openai_settings.include_encrypted_reasoning !== undefined) {
              setIncludeEncryptedReasoning(parsedBody.openai_settings.include_encrypted_reasoning);
            }
          }
          // Load Google-specific settings (only for google provider)
          if (parsedBody.google_settings) {
            if (parsedBody.google_settings.include_thoughts !== undefined) {
              setIncludeThoughts(parsedBody.google_settings.include_thoughts);
            }
            if (parsedBody.google_settings.thinking_budget !== undefined) {
              setThinkingBudget(parsedBody.google_settings.thinking_budget);
            }
            if (parsedBody.google_settings.thinking_level) {
              setThinkingLevel(parsedBody.google_settings.thinking_level);
            }
            if (parsedBody.google_settings.google_search_enabled !== undefined) {
              setGoogleSearchEnabled(parsedBody.google_settings.google_search_enabled);
            }
          } else {
            // Set sensible defaults for Google settings if not present
            setIncludeThoughts(false);
            setThinkingBudget(0);
            setThinkingLevel("THINKING_LEVEL_UNSPECIFIED");
            setGoogleSearchEnabled(false);
          }
        } catch (err) {
          console.error("Error parsing prompt body:", err);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadVersion = async (version: number) => {
    if (!prompt || !project) return;

    try {
      const response = await fetch(`/api/projects/${project.id}/prompts/${prompt.id}/versions/${version}`);
      if (!response.ok) {
        console.error("Failed to load version");
        return;
      }

      const data = await response.json();
      const versionData = data.version as PromptVersion;

      // Update form fields with version data
      setProvider(versionData.provider);
      setModel(versionData.model);

      // Parse body to populate form fields
      try {
        const parsedBody = JSON.parse(versionData.body);
        if (parsedBody.messages && Array.isArray(parsedBody.messages)) {
          const systemMsg = parsedBody.messages.find((m: { role: string }) => m.role === "system");
          const userMsg = parsedBody.messages.find((m: { role: string }) => m.role === "user");
          setSystemMessage(systemMsg?.content || "");
          setUserMessage(userMsg?.content || "");
        }

        // Load response format
        if (parsedBody.response_format) {
          if (parsedBody.response_format.type === "json_schema") {
            setResponseType("json");
            if (parsedBody.response_format.json_schema) {
              setJsonSchema(JSON.stringify(parsedBody.response_format.json_schema, null, 2));
            }
          } else {
            setResponseType("text");
          }
        } else {
          setResponseType("text");
        }

        // Load OpenAI-specific settings
        if (parsedBody.openai_settings) {
          setReasoningEffort(parsedBody.openai_settings.reasoning_effort || "medium");
          setReasoningSummary(parsedBody.openai_settings.reasoning_summary || "auto");
          setStoreEnabled(parsedBody.openai_settings.store ?? true);
          setIncludeEncryptedReasoning(parsedBody.openai_settings.include_encrypted_reasoning ?? true);
        }
        // Load Google-specific settings
        if (parsedBody.google_settings) {
          setIncludeThoughts(parsedBody.google_settings.include_thoughts ?? false);
          setThinkingBudget(parsedBody.google_settings.thinking_budget ?? 0);
          setThinkingLevel(parsedBody.google_settings.thinking_level || "THINKING_LEVEL_UNSPECIFIED");
          setGoogleSearchEnabled(parsedBody.google_settings.google_search_enabled ?? false);
        } else {
          // Set sensible defaults for Google settings if not present
          setIncludeThoughts(false);
          setThinkingBudget(0);
          setThinkingLevel("THINKING_LEVEL_UNSPECIFIED");
          setGoogleSearchEnabled(false);
        }
      } catch (err) {
        console.error("Error parsing version body:", err);
      }

      setSelectedVersion(version);
    } catch (err) {
      console.error("Error loading version:", err);
    }
  };

  const setAsDefault = async (version: number) => {
    if (!prompt || !project) return;

    try {
      const response = await fetch(`/api/projects/${project.id}/prompts/${prompt.id}/router`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error("Failed to set default version:", data.error);
        return;
      }

      // Update the router version state
      setRouterVersion(version);
    } catch (err) {
      console.error("Error setting default version:", err);
    }
  };

  const handleSave = async () => {
    if (!prompt || !project) return;

    // Validate required fields
    if (!provider.trim()) {
      setSaveError("Provider is required");
      return;
    }
    if (!model.trim()) {
      setSaveError("Model is required");
      return;
    }
    if (!systemMessage.trim() && !userMessage.trim()) {
      setSaveError("At least one message (system or user) is required");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);

      // Construct body with all configuration
      const promptBody: Record<string, unknown> = {
        provider: provider.trim(),
        model: model.trim(),
        messages: [
          systemMessage.trim() && {
            role: "system",
            content: systemMessage.trim(),
          },
          userMessage.trim() && {
            role: "user",
            content: userMessage.trim(),
          },
        ].filter(Boolean),
      };

      // Add response format if JSON schema is selected
      if (responseType === "json" && jsonSchema.trim()) {
        try {
          const parsedSchema = JSON.parse(jsonSchema);
          promptBody.response_format = {
            type: "json_schema",
            json_schema: parsedSchema,
          };
        } catch (err) {
          setSaveError("Invalid JSON schema format");
          return;
        }
      } else {
        promptBody.response_format = {
          type: "text",
        };
      }

      // Add OpenAI-specific settings (only for openai provider)
      if (provider === "openai") {
        promptBody.openai_settings = {
          reasoning_effort: reasoningEffort,
          reasoning_summary: reasoningSummary,
          store: storeEnabled,
          include_encrypted_reasoning: includeEncryptedReasoning,
        };
      }

      // Add Google-specific settings (only for google provider)
      if (provider === "google") {
        promptBody.google_settings = {
          include_thoughts: includeThoughts,
          thinking_budget: thinkingBudget,
          thinking_level: thinkingLevel,
          google_search_enabled: googleSearchEnabled,
        };
      }

      const response = await fetch(`/api/projects/${project.id}/prompts/${prompt.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: provider.trim(),
          model: model.trim(),
          body: JSON.stringify(promptBody),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to update prompt: ${response.statusText}`);
      }

      const responseData = await response.json();
      const updatedPrompt = responseData.prompt;

      // Update local state with the new version
      if (updatedPrompt?.latestVersion) {
        setSelectedVersion(updatedPrompt.latestVersion);
        setRouterVersion(updatedPrompt.latestVersion);
        setPrompt(updatedPrompt);
      }

      // Refresh versions list
      const versionsResponse = await fetch(`/api/projects/${project.id}/prompts/${prompt.id}/versions`);
      if (versionsResponse.ok) {
        const versionsData = await versionsResponse.json();
        setVersions(versionsData.versions || []);
      }
    } catch (err) {
      console.error("Error saving prompt:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save prompt");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !prompt || !project) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error || "Prompt not found"}</div>
        <Button onClick={() => navigate("/projects")}>Back to Projects</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card shrink-0">
        <div className="px-8 py-6">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/projects/${project.slug}/prompts`)}
              className="mt-1"
            >
              <ArrowLeft size={18} />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-semibold text-foreground">
                  {prompt.name}
                </h1>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/40 transition-colors">
                        v{selectedVersion || prompt.latestVersion}
                        {selectedVersion === routerVersion && (
                          <span className="text-[10px] ml-0.5 opacity-70">• active</span>
                        )}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {versions.map((version) => (
                        <DropdownMenuItem
                          key={version.version}
                          onClick={() => loadVersion(version.version)}
                          className="flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            {selectedVersion === version.version && (
                              <Check className="w-4 h-4" />
                            )}
                            <span className={selectedVersion !== version.version ? "ml-6" : ""}>
                              v{version.version}
                            </span>
                          </div>
                          {version.version === routerVersion && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              active
                            </span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {selectedVersion !== routerVersion && selectedVersion !== null && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setAsDefault(selectedVersion)}
                    >
                      Set active
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {project.name} / {prompt.slug}
              </p>
            </div>

            {/* Provider, Model, and Publish */}
            <div className="flex gap-3 shrink-0 items-end">
              <div className="w-48">
                <Label htmlFor="provider" className="text-xs font-medium mb-1 block">
                  Provider <span className="text-red-500">*</span>
                </Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-64">
                <Label htmlFor="model" className="text-xs font-medium mb-1 block">
                  Model <span className="text-red-500">*</span>
                </Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers
                      .find((p) => p.id === provider)
                      ?.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      )) || (
                      <SelectItem value="" disabled>
                        Select a provider first
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSave} disabled={isSaving} size="sm" className="h-9">
                {isSaving ? "Publishing..." : "Publish"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content - Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Prompt Configuration */}
        <div className="w-1/2 border-r border-border overflow-y-auto">
          <div className="p-6 space-y-4">
            {saveError && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-3">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {saveError}
                </p>
              </div>
            )}

            <div className="space-y-6">
              {/* Response Format */}
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Response format
                </Label>
                <div className="flex items-center gap-2">
                  <Select value={responseType} onValueChange={(value: "text" | "json") => setResponseType(value)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="json">JSON Schema</SelectItem>
                    </SelectContent>
                  </Select>
                  {responseType === "json" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSchemaEditValue(jsonSchema);
                        setIsSchemaDialogOpen(true);
                      }}
                    >
                      Edit Schema
                    </Button>
                  )}
                </div>
              </div>

              {/* OpenAI-specific Settings */}
              {provider === "openai" && (
                <>
                  <div className="relative">
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                    {/* Reasoning Effort */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">
                        Reasoning Effort
                      </Label>
                      <Select value={reasoningEffort} onValueChange={(value: "low" | "medium" | "high") => setReasoningEffort(value)}>
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
                      <Select value={reasoningSummary} onValueChange={(value: "auto" | "enabled" | "disabled") => setReasoningSummary(value)}>
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
                        onChange={(e) => setStoreEnabled(e.target.checked)}
                        className="w-4 h-4 rounded border-input"
                      />
                      <span className="text-xs text-muted-foreground">Store conversations</span>
                    </label>

                    {/* Include Encrypted Reasoning */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeEncryptedReasoning}
                        onChange={(e) => setIncludeEncryptedReasoning(e.target.checked)}
                        className="w-4 h-4 rounded border-input"
                      />
                      <span className="text-xs text-muted-foreground">Include encrypted reasoning</span>
                    </label>
                  </div>
                  </div>
                  <div className="relative">
                  </div>
                </>
              )}

              {/* Google-specific Settings */}
              {provider === "google" && (
                <>
                  <div className="relative">
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-md p-2">
                        <p className="text-[10px] text-amber-800 dark:text-amber-400">
                          Note: Use either Thinking Budget (for token control) OR Thinking Level (for quality preset), not both.
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
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 0;
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
                        <div className={thinkingLevel === "THINKING_LEVEL_UNSPECIFIED" ? "" : "col-span-2"}>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Thinking Level
                          </Label>
                          <Select
                            value={thinkingLevel}
                            onValueChange={(value: "THINKING_LEVEL_UNSPECIFIED" | "LOW" | "MEDIUM" | "HIGH" | "MINIMAL") => {
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
                              <SelectItem value="THINKING_LEVEL_UNSPECIFIED">Unspecified</SelectItem>
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
                          onChange={(e) => setIncludeThoughts(e.target.checked)}
                          className="w-4 h-4 rounded border-input"
                        />
                        <span className="text-xs text-muted-foreground">Include thoughts in response</span>
                      </label>

                      {/* Google Search Tool */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={googleSearchEnabled}
                          onChange={(e) => setGoogleSearchEnabled(e.target.checked)}
                          className="w-4 h-4 rounded border-input"
                        />
                        <span className="text-xs text-muted-foreground">Enable Google Search tool</span>
                      </label>
                    </div>
                  </div>
                  <div className="relative">
                  </div>
                </>
              )}

              {/* System Message */}
              {provider !== "openai" && (
                <div className="relative">
                </div>
              )}
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  System message
                </Label>
                <textarea
                  className="w-full min-h-[120px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-y"
                  placeholder="You are a helpful assistant..."
                  value={systemMessage}
                  onChange={(e) => setSystemMessage(e.target.value)}
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
                  onChange={(e) => setUserMessage(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Testing Area */}
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
                      onChange={(e) =>
                        setVariables((prev) => ({
                          ...prev,
                          [varName]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            {/* Run Test Button */}
            <div className="flex justify-end pt-2">
              <Button
                  onClick={async () => {
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
                        messages,
                        variables, // Pass variables to backend for substitution
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
                        setTestOutput(
                            `${result.content}\n\n---\nModel: ${result.model}\nTokens: ${result.usage?.total_tokens || "N/A"}`
                        );
                      } else {
                        setTestOutput("Error: Unexpected response format");
                      }
                    } catch (err) {
                      console.error("Error testing prompt:", err);
                      setTestOutput(`Error: ${err instanceof Error ? err.message : "Failed to test prompt"}`);
                    } finally {
                      setIsTesting(false);
                    }
                  }}
                  disabled={isTesting}
                  size="sm"
              >
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
                  <p className="text-foreground whitespace-pre-wrap">{testOutput}</p>
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
      </div>

      {/* JSON Schema Editor Dialog */}
      <Dialog open={isSchemaDialogOpen} onOpenChange={setIsSchemaDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit JSON Schema</DialogTitle>
            <DialogDescription>
              Define the structure for JSON responses. Enter a valid JSON schema object.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <textarea
              className="w-full min-h-[400px] px-3 py-2 text-sm rounded-md border border-input bg-background font-mono resize-y"
              placeholder={`{\n  "name": "response_schema",\n  "strict": true,\n  "schema": {\n    "type": "object",\n    "properties": {\n      "answer": {\n        "type": "string"\n      }\n    },\n    "required": ["answer"],\n    "additionalProperties": false\n  }\n}`}
              value={schemaEditValue}
              onChange={(e) => setSchemaEditValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsSchemaDialogOpen(false);
                setSchemaEditValue(jsonSchema);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Validate JSON
                try {
                  JSON.parse(schemaEditValue);
                  setJsonSchema(schemaEditValue);
                  setIsSchemaDialogOpen(false);
                } catch (err) {
                  alert("Invalid JSON format. Please check your schema.");
                }
              }}
            >
              Save Schema
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
