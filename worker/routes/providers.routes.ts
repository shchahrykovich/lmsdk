import { Hono } from "hono";
import type { HonoEnv } from "./app";
import { requireAuth } from "../middleware/auth.middleware";
import { ProviderService } from "../services/provider.service";
import type { AIMessage, GoogleSettings, OpenAISettings, ResponseFormat } from "../providers/base-provider";

import {NullPromptExecutionLogger} from "../providers/logger/null-prompt-execution-logger";

const providers = new Hono<HonoEnv>();

type ParsedExecuteRequest = {
  provider: string;
  model: string;
  messages: { role: AIMessage["role"]; content: string }[];
  response_format?: ResponseFormat;
  variables?: Record<string, unknown>;
  google_settings?: GoogleSettings;
  openai_settings?: OpenAISettings;
  projectId?: number;
  promptSlug?: string;
  proxy?: "none" | "cloudflare";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const getNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const getProxy = (value: unknown): "none" | "cloudflare" | undefined =>
  value === "cloudflare" || value === "none" ? value : undefined;

const isMessage = (value: unknown): value is { role: AIMessage["role"]; content: string } =>
  isRecord(value) && typeof value.role === "string" && typeof value.content === "string";

const isResponseFormat = (value: unknown): value is ResponseFormat =>
  isRecord(value) && (value.type === "text" || value.type === "json_schema" || value.type === "json");

const parseMessages = (
  value: unknown
): { messages?: ParsedExecuteRequest["messages"]; error?: string } => {
  if (!Array.isArray(value)) {
    return { error: "Missing required fields: provider, model, and messages are required" };
  }
  if (value.length === 0) {
    return { error: "At least one message is required" };
  }
  if (value.some((msg) => !isMessage(msg))) {
    return { error: "Each message must have 'role' and 'content' fields" };
  }
  return { messages: value as ParsedExecuteRequest["messages"] };
};

const parseExecuteBody = (
  value: unknown
): { data?: ParsedExecuteRequest; error?: string } => {
  if (!isRecord(value)) {
    return { error: "Missing required fields: provider, model, and messages are required" };
  }

  const provider = getString(value.provider);
  const model = getString(value.model);
  const messagesResult = parseMessages(value.messages);

  if (!provider || !model) {
    return { error: "Missing required fields: provider, model, and messages are required" };
  }

  if (!messagesResult.messages) {
    return { error: messagesResult.error ?? "Missing required fields: provider, model, and messages are required" };
  }

  return {
    data: {
      provider,
      model,
      messages: messagesResult.messages,
      response_format: isResponseFormat(value.response_format) ? value.response_format : undefined,
      variables: getRecord(value.variables),
      google_settings: getRecord(value.google_settings) as GoogleSettings | undefined,
      openai_settings: getRecord(value.openai_settings) as OpenAISettings | undefined,
      projectId: getNumber(value.projectId),
      promptSlug: getString(value.promptSlug),
      proxy: getProxy(value.proxy),
    },
  };
};

// Require authentication for all provider routes
providers.use("/*", requireAuth);

/**
 * GET /api/providers
 * Returns list of supported AI providers
 * Requires: Authentication
 */
providers.get("/", (c) => {
  // Initialize provider service with API keys from environment
  // Use NullLogger since this endpoint doesn't execute prompts
  const providerService = new ProviderService({
    openAIKey: c.env.OPEN_AI_API_KEY,
    geminiKey: c.env.GEMINI_API_KEY,
    cloudflareAiGatewayToken: c.env.CLOUDFLARE_AI_GATEWAY_TOKEN,
    cloudflareAiGatewayBaseUrl: c.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
  }, new NullPromptExecutionLogger(), c.env.CACHE);

  const providersList = providerService.getProviders();

  return c.json({ providers: providersList });
});

/**
 * POST /api/providers/execute
 * Executes a prompt using the specified AI provider
 * Requires: Authentication
 * Body: {
 *   provider: string,
 *   model: string,
 *   messages: Array<{role: string, content: string}>,
 *   response_format?: { type: "text" | "json_schema", json_schema?: object }
 * }
 */
providers.post("/execute", async (c) => {
  try {
    const body = await c.req.json();
    const parseResult = parseExecuteBody(body);
    if (parseResult.error || !parseResult.data) {
      return c.json({ error: parseResult.error ?? "Invalid request body" }, 400);
    }

    // Initialize provider service with NullLogger
    // This is for testing/development and doesn't need execution logging
    const providerService = new ProviderService({
      openAIKey: c.env.OPEN_AI_API_KEY,
      geminiKey: c.env.GEMINI_API_KEY,
      cloudflareAiGatewayToken: c.env.CLOUDFLARE_AI_GATEWAY_TOKEN,
      cloudflareAiGatewayBaseUrl: c.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
    }, new NullPromptExecutionLogger(), c.env.CACHE);

    const { provider, model, messages, variables, response_format, google_settings, openai_settings, proxy, projectId, promptSlug } =
      parseResult.data;

    // Execute the prompt using the provider service
    const result = await providerService.executePrompt(provider, {
      model,
      messages,
      variables,
      response_format,
      google_settings,
      openai_settings,
      proxy,
      projectId,
      promptSlug,
    });

    // Return the response
    return c.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Error executing prompt:", error);

    // Return error response
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
});

export default providers;
