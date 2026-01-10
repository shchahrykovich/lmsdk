/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { Prompt, Project, Provider, PromptVersion } from "@/pages/prompt-detail.types";
import { PromptHeader } from "@/pages/prompt-detail/PromptHeader";
import { PromptConfigurationPanel } from "@/pages/prompt-detail/PromptConfigurationPanel";
import { PromptTestingPanel } from "@/pages/prompt-detail/PromptTestingPanel";
import { JsonSchemaDialog } from "@/pages/prompt-detail/JsonSchemaDialog";
import CreateDatasetDialog from "@/components/CreateDatasetDialog";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isReasoningEffort = (value: unknown): value is "low" | "medium" | "high" =>
  value === "low" || value === "medium" || value === "high";

const isReasoningSummary = (value: unknown): value is "auto" | "enabled" | "disabled" =>
  value === "auto" || value === "enabled" || value === "disabled";

const isThinkingLevel = (
  value: unknown
): value is "THINKING_LEVEL_UNSPECIFIED" | "LOW" | "MEDIUM" | "HIGH" | "MINIMAL" =>
  value === "THINKING_LEVEL_UNSPECIFIED" ||
  value === "LOW" ||
  value === "MEDIUM" ||
  value === "HIGH" ||
  value === "MINIMAL";

export default function PromptDetail(): React.ReactNode {
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

  // Dataset creation
  const [isDatasetDialogOpen, setIsDatasetDialogOpen] = useState(false);

  useEffect(() => {
    void fetchData();
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
    const regex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
    const matches = text.matchAll(regex);
    const vars = new Set<string>();
    for (const match of matches) {
      vars.add(match[1].trim());
    }
    return Array.from(vars);
  };

  const applyMessages = (parsedBody: unknown) => {
    if (!isRecord(parsedBody) || !Array.isArray(parsedBody.messages)) {
      return;
    }

    const systemMsg = parsedBody.messages.find(
      (message) => isRecord(message) && message.role === "system"
    );
    const userMsg = parsedBody.messages.find(
      (message) => isRecord(message) && message.role === "user"
    );

    const systemContent =
      systemMsg && isRecord(systemMsg) && typeof systemMsg.content === "string"
        ? systemMsg.content
        : "";
    const userContent =
      userMsg && isRecord(userMsg) && typeof userMsg.content === "string"
        ? userMsg.content
        : "";

    setSystemMessage(systemContent);
    setUserMessage(userContent);
  };

  const applyResponseFormat = (parsedBody: unknown) => {
    if (!isRecord(parsedBody) || !isRecord(parsedBody.response_format)) {
      setResponseType("text");
      return;
    }

    const responseFormat = parsedBody.response_format;
    if (responseFormat.type === "json_schema") {
      setResponseType("json");
      if (responseFormat.json_schema !== undefined) {
        setJsonSchema(JSON.stringify(responseFormat.json_schema, null, 2));
      }
      return;
    }

    setResponseType("text");
  };

  const applyOpenAiSettings = (parsedBody: unknown) => {
    if (!isRecord(parsedBody) || !isRecord(parsedBody.openai_settings)) {
      return;
    }

    const openaiSettings = parsedBody.openai_settings;

    if (isReasoningEffort(openaiSettings.reasoning_effort)) {
      setReasoningEffort(openaiSettings.reasoning_effort);
    }
    if (isReasoningSummary(openaiSettings.reasoning_summary)) {
      setReasoningSummary(openaiSettings.reasoning_summary);
    }
    if (typeof openaiSettings.store === "boolean") {
      setStoreEnabled(openaiSettings.store);
    }
    if (typeof openaiSettings.include_encrypted_reasoning === "boolean") {
      setIncludeEncryptedReasoning(openaiSettings.include_encrypted_reasoning);
    }
  };

  const applyGoogleSettings = (parsedBody: unknown) => {
    if (isRecord(parsedBody) && isRecord(parsedBody.google_settings)) {
      const googleSettings = parsedBody.google_settings;

      setIncludeThoughts(googleSettings.include_thoughts === true);
      setThinkingBudget(
        typeof googleSettings.thinking_budget === "number" ? googleSettings.thinking_budget : 0
      );
      setThinkingLevel(
        isThinkingLevel(googleSettings.thinking_level)
          ? googleSettings.thinking_level
          : "THINKING_LEVEL_UNSPECIFIED"
      );
      setGoogleSearchEnabled(googleSettings.google_search_enabled === true);
      setCacheSystemMessage(googleSettings.cache_system_message === true);
      return;
    }

    setIncludeThoughts(false);
    setThinkingBudget(0);
    setThinkingLevel("THINKING_LEVEL_UNSPECIFIED");
    setGoogleSearchEnabled(false);
    setCacheSystemMessage(false);
  };

  const applyParsedBody = (parsedBody: unknown) => {
    const proxyValue = isRecord(parsedBody) ? parsedBody.proxy : undefined;
    setProxy(proxyValue === "cloudflare" ? "cloudflare" : "none");
    applyMessages(parsedBody);
    applyResponseFormat(parsedBody);
    applyOpenAiSettings(parsedBody);
    applyGoogleSettings(parsedBody);
  };

  const loadProviders = async () => {
    const providersResponse = await fetch("/api/providers");
    if (!providersResponse.ok) return;
    const providersData = await providersResponse.json();
    setProviders(providersData.providers ?? []);
  };

  const loadProject = async (): Promise<Project | null> => {
    const projectsResponse = await fetch("/api/projects");
    if (!projectsResponse.ok) {
      throw new Error(`Failed to fetch projects: ${projectsResponse.statusText}`);
    }
    const projectsData = await projectsResponse.json();
    const foundProject = projectsData.projects.find((p: Project) => p.slug === projectSlug);

    if (!foundProject) {
      setError("Project not found");
      return null;
    }

    return foundProject;
  };

  const loadPrompt = async (projectId: number): Promise<Prompt | null> => {
    const promptsResponse = await fetch(`/api/projects/${projectId}/prompts`);
    if (!promptsResponse.ok) {
      throw new Error(`Failed to fetch prompts: ${promptsResponse.statusText}`);
    }
    const promptsData = await promptsResponse.json();
    const foundPrompt = promptsData.prompts.find((p: Prompt) => p.slug === promptSlug);

    if (!foundPrompt) {
      setError("Prompt not found");
      return null;
    }

    return foundPrompt;
  };

  const loadVersionsAndRouter = async (projectId: number, promptId: number) => {
    const versionsResponse = await fetch(
      `/api/projects/${projectId}/prompts/${promptId}/versions`,
    );
    if (versionsResponse.ok) {
      const versionsData = await versionsResponse.json();
      setVersions(versionsData.versions ?? []);
    }

    const routerResponse = await fetch(
      `/api/projects/${projectId}/prompts/${promptId}/router`,
    );
    if (routerResponse.ok) {
      const routerData = await routerResponse.json();
      setRouterVersion(routerData.routerVersion);
    }
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
        newVars[varName] = prev[varName] ?? "";
      });
      return newVars;
    });
  }, [systemMessage, userMessage]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      await loadProviders();
      const foundProject = await loadProject();
      if (!foundProject) {
        return;
      }
      setProject(foundProject);

      const foundPrompt = await loadPrompt(foundProject.id);
      if (!foundPrompt) {
        return;
      }

      setPrompt(foundPrompt);
      setProvider(foundPrompt.provider);
      setModel(foundPrompt.model);

      await loadVersionsAndRouter(foundProject.id, foundPrompt.id);

      if (selectedVersion === null) {
        setSelectedVersion(foundPrompt.latestVersion);
      }

      try {
        const parsedBody = JSON.parse(foundPrompt.body);
        applyParsedBody(parsedBody);
      } catch (err) {
        console.error("Error parsing prompt body:", err);
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
        applyParsedBody(parsedBody);
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

    const getSaveValidationError = () => {
      if (!provider.trim()) {
        return "Provider is required";
      }
      if (!model.trim()) {
        return "Model is required";
      }
      if (!systemMessage.trim() && !userMessage.trim()) {
        return "At least one message (system or user) is required";
      }
      return null;
    };

    const buildPromptMessages = () => [
      systemMessage.trim() && {
        role: "system",
        content: systemMessage.trim(),
      },
      userMessage.trim() && {
        role: "user",
        content: userMessage.trim(),
      },
    ].filter(Boolean);

    const buildResponseFormat = () => {
      if (responseType === "json" && jsonSchema.trim()) {
        try {
          const parsedSchema = JSON.parse(jsonSchema);
          return { response_format: { type: "json_schema", json_schema: parsedSchema } };
        } catch {
          return { error: "Invalid JSON schema format" };
        }
      }

      return { response_format: { type: "text" } };
    };

    const buildPromptBody = () => {
      const body: Record<string, unknown> = {
        provider: provider.trim(),
        model: model.trim(),
        proxy,
        messages: buildPromptMessages(),
      };

      const responseFormat = buildResponseFormat();
      if ("error" in responseFormat) {
        return { error: responseFormat.error };
      }
      body.response_format = responseFormat.response_format;

      if (provider === "openai") {
        body.openai_settings = {
          reasoning_effort: reasoningEffort,
          reasoning_summary: reasoningSummary,
          store: storeEnabled,
          include_encrypted_reasoning: includeEncryptedReasoning,
        };
      }

      if (provider === "google") {
        body.google_settings = {
          include_thoughts: includeThoughts,
          thinking_budget: thinkingBudget,
          thinking_level: thinkingLevel,
          google_search_enabled: googleSearchEnabled,
          cache_system_message: cacheSystemMessage,
        };
      }

      return { body };
    };

    const validationError = getSaveValidationError();
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);

      const promptBodyResult = buildPromptBody();
      if ("error" in promptBodyResult) {
        setSaveError(promptBodyResult.error ?? '');
        return;
      }
      const promptBody = promptBodyResult.body;

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
        throw new Error(data.error ?? `Failed to update prompt: ${response.statusText}`);
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
        setVersions(versionsData.versions ?? []);
      }
    } catch (err) {
      console.error("Error saving prompt:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save prompt");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadVersion = (version: number) => {
    void loadVersion(version);
  };

  const handleSetAsDefault = (version: number) => {
    void setAsDefault(version);
  };

  const handlePromptSave = () => {
    void handleSave();
  };

  const handleCreateDataset = () => {
    setIsDatasetDialogOpen(true);
  };

  const handleDatasetCreated = (dataset: { id: number; name: string; slug: string }) => {
    if (project && projectSlug) {
      void navigate(`/projects/${projectSlug}/datasets/${dataset.slug}`);
    }
  };

  // Get initial schema from prompt variables
  const getInitialSchema = (): Record<string, { type: string }> => {
    const allVars = getAllVariables();
    const schema: Record<string, { type: string }> = {};
    allVars.forEach((varName) => {
      schema[varName] = { type: "string" };
    });
    return schema;
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
        <div className="text-red-500 mb-4">{error ?? "Prompt not found"}</div>
        <Button onClick={() => { void navigate("/projects"); }}>Back to Projects</Button>
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
        loadVersion={handleLoadVersion}
        setAsDefault={handleSetAsDefault}
        provider={provider}
        setProvider={setProvider}
        model={model}
        setModel={setModel}
        proxy={proxy}
        setProxy={setProxy}
        providers={providers}
        isSaving={isSaving}
        handleSave={handlePromptSave}
        onCreateDataset={handleCreateDataset}
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

      {/* Create Dataset Dialog */}
      {project && prompt && (
        <CreateDatasetDialog
          open={isDatasetDialogOpen}
          onOpenChange={setIsDatasetDialogOpen}
          projectId={project.id}
          onSuccess={handleDatasetCreated}
          initialSchema={getInitialSchema()}
          defaultName={`${prompt.name} v${selectedVersion ?? prompt.latestVersion} Dataset`}
        />
      )}
    </div>
  );
}
