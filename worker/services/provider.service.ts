import { ProviderFactory, type ProviderConfig } from "../providers/provider-factory";
import type { ExecuteRequest, ExecuteResult, AIMessage } from "../providers/base-provider";
import { getOpenAIModels } from "../utils/openai-models";
import { getOpenRouterModels } from "../utils/openrouter-models";
import { getAnthropicModels } from "../utils/anthropic-models";
import { getOpenRouterDecisionModels } from "../utils/openrouter-decision-models";
import type { IPromptExecutionLogger } from "../providers/logger/execution-logger";
import { renderExecuteRequest } from "../execution/prompt-renderer";

/**
 * Provider metadata for frontend display
 */
export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  models: { id: string; name: string }[];
}

/**
 * Extended execution request with variable support
 */
export interface ExecutePromptRequest extends Omit<ExecuteRequest, 'messages'> {
  messages: AIMessage[];
  variables?: Record<string, unknown>;
}

/**
 * Service for managing AI providers
 * Handles provider creation, model lists, and prompt execution
 */
export class ProviderService {
  private factory: ProviderFactory;

  constructor(config: ProviderConfig, logger: IPromptExecutionLogger, cache: KVNamespace) {
    this.factory = new ProviderFactory(config, logger, cache);
  }

  /**
   * Get list of all available providers with their models
   * @returns Array of provider information
   */
  getProviders(): ProviderInfo[] {
    return [
      {
        id: "openai",
        name: "OpenAI",
        description: "GPT models including GPT-6, GPT-5, GPT-4o, O-series, and more",
        models: getOpenAIModels(),
      },
      {
        id: "google",
        name: "Google",
        description: "Gemini 3.x Flash, Gemini Pro, and other Google models",
        models: [
          { id: "gemini-flash-lite-latest", name: "Gemini Flash Lite (Latest)" },
          { id: "gemini-flash-latest", name: "Gemini Flash (Latest)" },
          { id: "gemini-pro-latest", name: "Gemini Pro (Latest)" },
          { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
          { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash" },
          { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
          { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
          { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
          { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (Preview)" },
          { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
          { id: "gemini-3-flash-preview", name: "Gemini 3.0 Flash (Preview)" },
          { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
          { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
          { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
        ],
      },
      {
        id: "openrouter",
        name: "OpenRouter",
        description: "Claude, Grok, DeepSeek, Qwen, Kimi, Mistral, GLM and Llama through one API",
        models: getOpenRouterModels(),
      },
      {
        id: "anthropic",
        name: "Anthropic",
        description: "Claude models through the Anthropic API, with native batch support",
        models: getAnthropicModels(),
      },
      {
        id: "openrouter-decisions",
        name: "OpenRouter Decisions",
        description: "Jev decision model: typed yes/no, choice and score answers with probabilities",
        models: getOpenRouterDecisionModels(),
      },
    ];
  }

  /**
   * Execute a prompt using the specified provider
   * @param providerName - Name of the provider (e.g., "openai", "google")
   * @param request - Execution request parameters with optional variables
   * @returns Promise with execution result
   * @throws Error if provider is not supported or execution fails
   */
  async executePrompt(
    providerName: string,
    request: ExecutePromptRequest
  ): Promise<ExecuteResult> {
    // Create provider instance using factory
    const provider = this.factory.createProvider(providerName);

    // Validate model is supported (basic validation)
    if (!provider.isModelSupported(request.model)) {
      throw new Error(`Model '${request.model}' is not supported by provider '${providerName}'`);
    }

    const result = await provider.execute(renderExecuteRequest(request));
    return result;
  }

  /**
   * Check if a provider is supported
   * @param providerName - Name of the provider
   * @returns True if provider is supported
   */
  isProviderSupported(providerName: string): boolean {
    return this.factory.isProviderSupported(providerName);
  }

  /**
   * Get list of supported provider names
   * @returns Array of supported provider names
   */
  getSupportedProviderNames(): string[] {
    return this.factory.getSupportedProviders();
  }
}
