import { AIProvider } from "./base-provider";
import { OpenAIProvider } from "./openai-provider";
import { GoogleProvider } from "./google-provider";
import type { IPromptExecutionLogger } from "./logger/execution-logger";

/**
 * Configuration for creating a provider instance
 */
export interface ProviderConfig {
  openAIKey?: string;
  geminiKey?: string;
}

/**
 * Factory for creating AI provider instances
 * Uses the factory pattern to instantiate the correct provider based on provider name
 */
export class ProviderFactory {
  private config: ProviderConfig;
  private logger: IPromptExecutionLogger;

  constructor(config: ProviderConfig, logger: IPromptExecutionLogger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Create a provider instance
   * @param providerName - Name of the provider (e.g., "openai", "google")
   * @returns AIProvider instance
   * @throws Error if provider is not supported or API key is missing
   */
  createProvider(providerName: string): AIProvider {
    switch (providerName.toLowerCase()) {
      case "openai":
        if (!this.config.openAIKey) {
          throw new Error("OpenAI API key not configured. Please set OPEN_AI_API_KEY secret.");
        }
        return new OpenAIProvider(this.config.openAIKey, this.logger);

      case "google":
        if (!this.config.geminiKey) {
          throw new Error("Google Gemini API key not configured. Please set GEMINI_API_KEY secret.");
        }
        return new GoogleProvider(this.config.geminiKey, this.logger);

      default:
        throw new Error(
          `Provider '${providerName}' is not supported. Supported providers: openai, google`
        );
    }
  }

  /**
   * Check if a provider is supported
   * @param providerName - Name of the provider
   * @returns True if provider is supported
   */
  isProviderSupported(providerName: string): boolean {
    const supported = ["openai", "google"];
    return supported.includes(providerName.toLowerCase());
  }

  /**
   * Get list of supported provider names
   * @returns Array of supported provider names
   */
  getSupportedProviders(): string[] {
    return ["openai", "google"];
  }
}
