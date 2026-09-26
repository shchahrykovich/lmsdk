/**
 * Base interface for AI provider messages
 */
export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Response format configuration
 */
export interface ResponseFormat {
  type: "text" | "json_schema" | "json";
  json_schema?: {
    name?: string;
    strict?: boolean;
    schema?: unknown;
    [key: string]: unknown;
  };
}

/**
 * OpenAI-specific settings for reasoning models
 */
export interface OpenAISettings {
  reasoning_effort?: "low" | "medium" | "high";
  reasoning_summary?: "auto" | "concise" | "detailed" | "enabled" | "disabled";
  store?: boolean;
  include_encrypted_reasoning?: boolean;
}

/**
 * Google-specific settings for thinking models
 */
export interface GoogleSettings {
  include_thoughts?: boolean;
  thinking_budget?: number;
  thinking_level?: "THINKING_LEVEL_UNSPECIFIED" | "LOW" | "MEDIUM" | "HIGH" | "MINIMAL";
  google_search_enabled?: boolean;
  cache_system_message?: boolean;
}

/**
 * OpenRouter-specific settings for reasoning and upstream provider routing
 */
export const OPENROUTER_REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high"] as const;
export const OPENROUTER_PROVIDER_SORTS = ["throughput", "latency", "price"] as const;

export interface OpenRouterSettings {
  reasoning_effort?: (typeof OPENROUTER_REASONING_EFFORTS)[number];
  provider_sort?: (typeof OPENROUTER_PROVIDER_SORTS)[number];
  temperature?: number;
  max_tokens?: number;
}

/**
 * Request parameters for AI execution
 */
export interface ExecuteRequest {
  model: string;
  messages: AIMessage[];
  response_format?: ResponseFormat;
  openai_settings?: OpenAISettings;
  google_settings?: GoogleSettings;
  openrouter_settings?: OpenRouterSettings;
  variables?: Record<string, unknown>;
  proxy?: "none" | "cloudflare";
  // For Google cache key generation
  projectId?: number;
  promptSlug?: string;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  // Optional fields for provider-specific token breakdowns
  thoughts_tokens?: number; // Google: tokens used for thinking/reasoning
  tool_use_prompt_tokens?: number; // Google: tokens from tool execution results
  cached_content_tokens?: number; // Google: tokens from cached content
  cached_tokens?: number; // OpenRouter: prompt tokens read from the provider cache
  reasoning_tokens?: number; // OpenRouter: output tokens spent on reasoning
  cost?: number; // OpenRouter: charged cost in USD
}

/**
 * Execution result from AI provider
 */
export interface ExecuteResult {
  content: string;
  model: string;
  usage: TokenUsage;
  duration_ms?: number;
}

/**
 * Abstract base class for AI providers
 * All provider implementations must extend this class
 */
export abstract class AIProvider {
  protected apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("API key is required");
    }
    this.apiKey = apiKey;
  }

  /**
   * Execute a prompt with the AI provider
   * @param request - Execution request parameters
   * @returns Promise with execution result
   */
  abstract execute(request: ExecuteRequest): Promise<ExecuteResult>;

  /**
   * Get the provider name (e.g., "openai", "google")
   */
  abstract getProviderName(): string;

  /**
   * Validate if a model is supported by this provider
   * @param model - Model identifier
   * @returns True if model is supported
   */
  abstract isModelSupported(model: string): boolean;
}
