import type { ProviderConfig } from "../../providers/provider-factory";
import type { BatchAdapter } from "./batch-adapter";
import { OpenAIBatchAdapter } from "./openai-batch-adapter";
import { AnthropicBatchAdapter } from "./anthropic-batch-adapter";
import { GoogleBatchAdapter } from "./google-batch-adapter";

export const NATIVE_BATCH_PROVIDERS = ["openai", "anthropic", "google"] as const;

export const PACED_ITEM_MAX_BYTES = 4 * 1024 * 1024;

export class BatchProviderNotConfiguredError extends Error {
  constructor(provider: string, secret: string) {
    super(`The ${provider} API key is not configured. Set the ${secret} secret.`);
    this.name = "BatchProviderNotConfiguredError";
  }
}

export const hasNativeBatch = (provider: string): boolean =>
  (NATIVE_BATCH_PROVIDERS as readonly string[]).includes(provider);

export type BatchAdapterFactory = (provider: string) => BatchAdapter;

export function createBatchAdapterFactory(config: ProviderConfig): BatchAdapterFactory {
  return (provider) => {
    switch (provider) {
      case "openai":
        if (!config.openAIKey) throw new BatchProviderNotConfiguredError("OpenAI", "OPEN_AI_API_KEY");
        return new OpenAIBatchAdapter(config.openAIKey);
      case "anthropic":
        if (!config.anthropicKey) throw new BatchProviderNotConfiguredError("Anthropic", "ANTHROPIC_API_KEY");
        return new AnthropicBatchAdapter(config.anthropicKey);
      case "google":
        if (!config.geminiKey) throw new BatchProviderNotConfiguredError("Google", "GEMINI_API_KEY");
        return new GoogleBatchAdapter(config.geminiKey);
      default:
        throw new Error(`Provider "${provider}" has no native batch API`);
    }
  };
}
