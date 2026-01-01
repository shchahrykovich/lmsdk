import { ProviderFactory, type ProviderConfig } from "../providers/provider-factory";
import type { ExecuteRequest, ExecuteResult, AIMessage } from "../providers/base-provider";
import { getOpenAIModels } from "../utils/openai-models";
import type { IPromptExecutionLogger } from "../providers/logger/execution-logger";

/**
 * Provider metadata for frontend display
 */
export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  models: Array<{ id: string; name: string }>;
}

/**
 * Extended execution request with variable support
 */
export interface ExecutePromptRequest extends Omit<ExecuteRequest, 'messages'> {
  messages: AIMessage[];
  variables?: Record<string, any>;
}

/**
 * Service for managing AI providers
 * Handles provider creation, model lists, and prompt execution
 */
export class ProviderService {
  private factory: ProviderFactory;

  constructor(config: ProviderConfig, logger: IPromptExecutionLogger) {
    this.factory = new ProviderFactory(config, logger);
  }

  /**
   * Replace variables in a template string
   * Supports {{variable}} and {{variable.property}} syntax
   */
  private replaceVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();

      // Support nested properties like {{user.name}}
      const keys = trimmedKey.split('.');
      let value: any = variables;

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          // Variable not found, return original placeholder
          return match;
        }
      }

      // Convert to string, handling null/undefined
      return value != null ? String(value) : match;
    });
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
        description: "GPT models including GPT-5, GPT-4o, O-series, and more",
        models: getOpenAIModels(),
      },
      {
        id: "google",
        name: "Google",
        description: "Gemini Flash, Gemini Pro, and other Google models",
        models: [
          { id: "gemini-flash-lite-latest", name: "Gemini Flash Lite (Latest)" },
          { id: "gemini-flash-latest", name: "Gemini Flash (Latest)" },
          { id: "gemini-3-pro-preview", name: "Gemini 3.0 Pro (Preview)" },
          { id: "gemini-3-flash-preview", name: "Gemini 3.0 Flash (Preview)" },
          { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash (Experimental)" },
          { id: "gemini-exp-1206", name: "Gemini Experimental 1206" },
          { id: "gemini-2.0-flash-thinking-exp-1219", name: "Gemini 2.0 Flash Thinking" },
          { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
          { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
          { id: "gemini-1.5-flash-8b", name: "Gemini 1.5 Flash 8B" },
        ],
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

    // Replace variables in messages if variables are provided
    const messages = request.variables
      ? request.messages.map((msg) => ({
          ...msg,
          content: this.replaceVariables(msg.content, request.variables || {}),
        }))
      : request.messages;

    // Execute the prompt
    return await provider.execute({
      model: request.model,
      messages,
      response_format: request.response_format,
      openai_settings: request.openai_settings,
      variables: request.variables,
    });
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
