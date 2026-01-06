import { GoogleGenAI } from "@google/genai";
import {
  AIProvider,
  type ExecuteRequest,
  type ExecuteResult,
} from "./base-provider";
import type { IPromptExecutionLogger } from "./logger/execution-logger";

/**
 * Cache TTL (Time To Live) configuration
 * Google cache expects duration in seconds as a string (e.g., "3600s")
 * Cloudflare KV expects TTL in seconds as a number
 *
 * Default: 1 hour (3600 seconds)
 */
const CACHE_TTL_SECONDS = 3600;
const GOOGLE_CACHE_TTL = `${CACHE_TTL_SECONDS}s`;

interface CachedContentParams {
  model: string;
  googleSettings: ExecuteRequest["google_settings"];
  systemInstruction: string;
  projectId?: number;
  promptSlug?: string;
}

type GoogleUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  cachedContentTokenCount?: number;
};

type GoogleStreamChunk = {
  text?: string;
  usageMetadata?: GoogleUsageMetadata;
};

/**
 * Google Gemini provider implementation
 * Uses Google GenAI SDK for executing prompts
 */
export class GoogleProvider extends AIProvider {
  private client: GoogleGenAI;
  protected logger: IPromptExecutionLogger;
  private cache: KVNamespace;
  private proxyConfig?: { token?: string; baseUrl?: string };

  constructor(
    apiKey: string,
    logger: IPromptExecutionLogger,
    cache: KVNamespace,
    proxyConfig?: { token?: string; baseUrl?: string }
  ) {
    super(apiKey);
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    this.logger = logger;
    this.cache = cache;
    this.proxyConfig = proxyConfig;
  }

  getProviderName(): string {
    return "google";
  }

  isModelSupported(model: string): boolean {
    // Basic validation - could be enhanced with a model list
    return model.length > 0;
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    const startTime = Date.now();
    const { model, messages, response_format, variables, google_settings, projectId, promptSlug } = request;

    // Log variables if provided
    if (variables) {
      await this.logger.logVariables({ variables });
    }

    try {
      const { systemInstruction, contents } = this.buildContents(messages);
      const cachedContentName = await this.getCachedContentName({
        model,
        googleSettings: google_settings,
        systemInstruction,
        projectId,
        promptSlug,
      });
      const config = this.buildGenerationConfig(
        response_format,
        google_settings,
        systemInstruction,
        cachedContentName
      );

      // Log input
      await this.logger.logInput({
        input: {
          model: model,
          config: config,
          contents: contents,
        },
      });

      const client = this.getClient(request);

      // Execute the request using generateContentStream
      const response = await client.models.generateContentStream({
        model: model,
        config: config,
        contents: contents,
      }) as AsyncIterable<GoogleStreamChunk>;

      const { outputText, chunks, usageMetadata } = await this.collectStream(response);

      const durationMs = Date.now() - startTime;

      const result = this.buildResult(model, outputText, usageMetadata, durationMs);

      // Log output
      await this.logger.logOutput({
        output: chunks,
      });

      await this.logger.logResult({
        output: result,
      });


      // Log successful execution
      await this.logger.logSuccess({
        durationMs,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log failed execution
      await this.logger.logError({
        durationMs,
        errorMessage,
      });

      throw error;
    }
  }

  private buildContents(messages: ExecuteRequest["messages"]) {
    let systemInstruction = "";
    const contents: { role: string; parts: { text: string }[] }[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction += msg.content + "\n\n";
      } else if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "assistant") {
        contents.push({
          role: "model",
          parts: [{ text: msg.content }],
        });
      }
    }

    if (contents.length === 0 && systemInstruction) {
      contents.push({
        role: "user",
        parts: [{ text: systemInstruction }],
      });
      systemInstruction = "";
    }

    return { systemInstruction, contents };
  }

  private async getCachedContentName(params: CachedContentParams): Promise<string | null> {
    const { model, googleSettings, systemInstruction, projectId, promptSlug } = params;
    if (!this.shouldUseCache(googleSettings, systemInstruction, projectId, promptSlug)) {
      return null;
    }

    const cacheKey = this.getCacheKey(projectId ?? -1, promptSlug ?? '');
    const cachedContentName = await this.loadCachedContentName(cacheKey);
    if (cachedContentName) {
      return cachedContentName;
    }

    return this.createCachedContentName({
      model,
      systemInstruction,
      cacheKey,
    });
  }

  private shouldUseCache(
    googleSettings: ExecuteRequest["google_settings"],
    systemInstruction: string,
    projectId?: number,
    promptSlug?: string
  ): boolean {
    return Boolean(
      googleSettings?.cache_system_message &&
        systemInstruction.trim() &&
        projectId &&
        promptSlug
    );
  }

  private getCacheKey(projectId: number, promptSlug: string): string {
    return `gemini_cache_${projectId}__${promptSlug}`;
  }

  private async loadCachedContentName(cacheKey: string): Promise<string | null> {
    try {
      return (await this.cache.get(cacheKey)) ?? null;
    } catch (error) {
      console.error("Error managing cache:", error);
      return null;
    }
  }

  private async createCachedContentName(params: {
    model: string;
    systemInstruction: string;
    cacheKey: string;
  }): Promise<string | null> {
    const { model, systemInstruction, cacheKey } = params;
    try {
      const newCache = await this.client.caches.create({
        model: model,
        config: {
          systemInstruction: systemInstruction.trim(),
          displayName: cacheKey,
          ttl: GOOGLE_CACHE_TTL,
        },
      });
      const cachedContentName = newCache.name ?? null;

      if (cachedContentName) {
        await this.cache.put(cacheKey, cachedContentName, {
          expirationTtl: CACHE_TTL_SECONDS,
        });
      }
      return cachedContentName;
    } catch (error) {
      if (!this.isDuplicateCacheError(error)) {
        console.error("Error creating cache:", error);
      }
      return null;
    }
  }

  private isDuplicateCacheError(error: unknown): boolean {
    const message =
      error && typeof error === "object" && "message" in error
        ? (error as { message?: unknown }).message
        : undefined;
    return typeof message === "string" && (message.includes("duplicate") || message.includes("already exists"));
  }

  private buildGenerationConfig(
    responseFormat: ExecuteRequest["response_format"],
    googleSettings: ExecuteRequest["google_settings"],
    systemInstruction: string,
    cachedContentName: string | null
  ) {
    const config: Record<string, unknown> = {};

    this.applySystemInstruction(config, systemInstruction, cachedContentName);
    this.applyResponseFormat(config, responseFormat);
    this.applyGoogleSettings(config, googleSettings);

    return config;
  }

  private applySystemInstruction(
    config: Record<string, unknown>,
    systemInstruction: string,
    cachedContentName: string | null
  ) {
    if (cachedContentName) {
      config.cachedContent = cachedContentName;
      return;
    }

    if (systemInstruction.trim()) {
      config.systemInstruction = systemInstruction.trim();
    }
  }

  private applyResponseFormat(
    config: Record<string, unknown>,
    responseFormat: ExecuteRequest["response_format"]
  ) {
    if (responseFormat?.type !== "json_schema" && responseFormat?.type !== "json") {
      return;
    }

    config.responseMimeType = "application/json";
    if (responseFormat.json_schema) {
      config.responseSchema = responseFormat.json_schema.schema ?? responseFormat.json_schema;
    }
  }

  private applyGoogleSettings(
    config: Record<string, unknown>,
    googleSettings: ExecuteRequest["google_settings"]
  ) {
    if (!googleSettings) return;

    const thinkingConfig: Record<string, unknown> = {};

    if (googleSettings.include_thoughts !== undefined) {
      thinkingConfig.includeThoughts = googleSettings.include_thoughts;
    }

    if (googleSettings.thinking_budget !== undefined && googleSettings.thinking_budget != 0) {
      thinkingConfig.thinkingBudget = googleSettings.thinking_budget;
    } else if (
      googleSettings.thinking_level &&
      googleSettings.thinking_level !== "THINKING_LEVEL_UNSPECIFIED"
    ) {
      thinkingConfig.thinkingLevel = googleSettings.thinking_level;
    }

    if (Object.keys(thinkingConfig).length > 0) {
      config.thinkingConfig = thinkingConfig;
    }

    if (googleSettings.google_search_enabled) {
      config.tools = [{ type: "google_search" }];
    }
  }

  private async collectStream(response: AsyncIterable<GoogleStreamChunk>) {
    let outputText = "";
    const chunks: GoogleStreamChunk[] = [];
    let usageMetadata: GoogleUsageMetadata | null = null;

    for await (const chunk of response) {
      chunks.push(chunk);
      if (chunk.text) {
        outputText += chunk.text;
      }
      if (chunk.usageMetadata) {
        usageMetadata = chunk.usageMetadata;
      }
    }

    return { outputText, chunks, usageMetadata };
  }

  private buildResult(
    model: string,
    outputText: string,
    usageMetadata: GoogleUsageMetadata | null,
    durationMs: number
  ): ExecuteResult {
    return {
      content: outputText,
      model: model,
      usage: {
        prompt_tokens: usageMetadata?.promptTokenCount ?? 0,
        completion_tokens: usageMetadata?.candidatesTokenCount ?? 0,
        total_tokens: usageMetadata?.totalTokenCount ?? 0,
        thoughts_tokens: usageMetadata?.thoughtsTokenCount,
        tool_use_prompt_tokens: usageMetadata?.toolUsePromptTokenCount,
        cached_content_tokens: usageMetadata?.cachedContentTokenCount,
      },
      duration_ms: durationMs,
    };
  }

  private getClient(request: ExecuteRequest): GoogleGenAI {
    if (request.proxy !== "cloudflare") {
      return this.client;
    }

    if (!this.proxyConfig?.token || !this.proxyConfig?.baseUrl) {
      return this.client;
    }

    const headers: Record<string, string> = {
      "cf-aig-authorization": `Bearer ${this.proxyConfig.token}`,
    };

    return new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: {
        baseUrl: this.proxyConfig.baseUrl + '/google-ai-studio',
        headers,
      },
    });
  }
}
