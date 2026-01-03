import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { Prompt, Project, Provider, PromptVersion } from "@/pages/prompt-detail.types";
import { PromptHeader } from "@/pages/prompt-detail/PromptHeader";
import { PromptConfigurationPanel } from "@/pages/prompt-detail/PromptConfigurationPanel";
import { PromptTestingPanel } from "@/pages/prompt-detail/PromptTestingPanel";
import { JsonSchemaDialog } from "@/pages/prompt-detail/JsonSchemaDialog";

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

  // Proxy settings
  const [proxy, setProxy] = useState<"none" | "cloudflare">("none");

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
  const [cacheSystemMessage, setCacheSystemMessage] = useState(false);

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
          // Load proxy setting
          if (parsedBody.proxy) {
            setProxy(parsedBody.proxy);
          }
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
            if (parsedBody.google_settings.cache_system_message !== undefined) {
              setCacheSystemMessage(parsedBody.google_settings.cache_system_message);
            }
          } else {
            // Set sensible defaults for Google settings if not present
            setIncludeThoughts(false);
            setThinkingBudget(0);
            setThinkingLevel("THINKING_LEVEL_UNSPECIFIED");
            setGoogleSearchEnabled(false);
            setCacheSystemMessage(false);
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
        // Load proxy setting
        if (parsedBody.proxy) {
          setProxy(parsedBody.proxy);
        } else {
          setProxy("none");
        }
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
          setCacheSystemMessage(parsedBody.google_settings.cache_system_message ?? false);
        } else {
          // Set sensible defaults for Google settings if not present
          setIncludeThoughts(false);
          setThinkingBudget(0);
          setThinkingLevel("THINKING_LEVEL_UNSPECIFIED");
          setGoogleSearchEnabled(false);
          setCacheSystemMessage(false);
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
        proxy: proxy,
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
          cache_system_message: cacheSystemMessage,
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
      <PromptHeader
        prompt={prompt}
        project={project}
        selectedVersion={selectedVersion}
        routerVersion={routerVersion}
        versions={versions}
        loadVersion={loadVersion}
        setAsDefault={setAsDefault}
        provider={provider}
        setProvider={setProvider}
        model={model}
        setModel={setModel}
        proxy={proxy}
        setProxy={setProxy}
        providers={providers}
        isSaving={isSaving}
        handleSave={handleSave}
        onBack={() => navigate(`/projects/${project.slug}/prompts`)}
      />

      {/* Content - Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        <PromptConfigurationPanel
          saveError={saveError}
          responseType={responseType}
          setResponseType={setResponseType}
          onEditSchema={() => {
            setSchemaEditValue(jsonSchema);
            setIsSchemaDialogOpen(true);
          }}
          provider={provider}
          systemMessage={systemMessage}
          setSystemMessage={setSystemMessage}
          userMessage={userMessage}
          setUserMessage={setUserMessage}
          reasoningEffort={reasoningEffort}
          setReasoningEffort={setReasoningEffort}
          reasoningSummary={reasoningSummary}
          setReasoningSummary={setReasoningSummary}
          storeEnabled={storeEnabled}
          setStoreEnabled={setStoreEnabled}
          includeEncryptedReasoning={includeEncryptedReasoning}
          setIncludeEncryptedReasoning={setIncludeEncryptedReasoning}
          includeThoughts={includeThoughts}
          setIncludeThoughts={setIncludeThoughts}
          thinkingBudget={thinkingBudget}
          setThinkingBudget={setThinkingBudget}
          thinkingLevel={thinkingLevel}
          setThinkingLevel={setThinkingLevel}
          googleSearchEnabled={googleSearchEnabled}
          setGoogleSearchEnabled={setGoogleSearchEnabled}
          cacheSystemMessage={cacheSystemMessage}
          setCacheSystemMessage={setCacheSystemMessage}
        />

        <PromptTestingPanel
          variables={variables}
          setVariables={setVariables}
          provider={provider}
          model={model}
          proxy={proxy}
          responseType={responseType}
          jsonSchema={jsonSchema}
          systemMessage={systemMessage}
          userMessage={userMessage}
          reasoningEffort={reasoningEffort}
          reasoningSummary={reasoningSummary}
          storeEnabled={storeEnabled}
          includeEncryptedReasoning={includeEncryptedReasoning}
          includeThoughts={includeThoughts}
          thinkingBudget={thinkingBudget}
          thinkingLevel={thinkingLevel}
          googleSearchEnabled={googleSearchEnabled}
          cacheSystemMessage={cacheSystemMessage}
          projectId={project.id}
          promptSlug={promptSlug ?? prompt.slug}
          testOutput={testOutput}
          setTestOutput={setTestOutput}
          isTesting={isTesting}
          setIsTesting={setIsTesting}
        />
      </div>

      {/* JSON Schema Editor Dialog */}
      <JsonSchemaDialog
        isSchemaDialogOpen={isSchemaDialogOpen}
        setIsSchemaDialogOpen={setIsSchemaDialogOpen}
        schemaEditValue={schemaEditValue}
        setSchemaEditValue={setSchemaEditValue}
        jsonSchema={jsonSchema}
        setJsonSchema={setJsonSchema}
      />
    </div>
  );
}
