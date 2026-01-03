import { Hono } from "hono";
import type { HonoEnv } from "./app";
import { requireAuth } from "../middleware/auth.middleware";
import { ProviderService } from "../services/provider.service";
import type { AIMessage } from "../providers/base-provider";

import {NullPromptExecutionLogger} from "../providers/logger/null-prompt-execution-logger";

const providers = new Hono<HonoEnv>();

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
    const { provider, model, messages, response_format, variables, google_settings, openai_settings, projectId, promptSlug, proxy } = body;

    // Validate required fields
    if (!provider || !model || !messages || !Array.isArray(messages)) {
      return c.json(
        {
          error: "Missing required fields: provider, model, and messages are required",
        },
        400
      );
    }

    // Validate messages format
    if (messages.length === 0) {
      return c.json({ error: "At least one message is required" }, 400);
    }

    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return c.json(
          { error: "Each message must have 'role' and 'content' fields" },
          400
        );
      }
    }

    // Initialize provider service with NullLogger
    // This is for testing/development and doesn't need execution logging
    const providerService = new ProviderService({
      openAIKey: c.env.OPEN_AI_API_KEY,
      geminiKey: c.env.GEMINI_API_KEY,
      cloudflareAiGatewayToken: c.env.CLOUDFLARE_AI_GATEWAY_TOKEN,
      cloudflareAiGatewayBaseUrl: c.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
    }, new NullPromptExecutionLogger(), c.env.CACHE);

    // Convert messages to AIMessage format
    const aiMessages: AIMessage[] = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Execute the prompt using the provider service
    const result = await providerService.executePrompt(provider, {
      model,
      messages: aiMessages,
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
