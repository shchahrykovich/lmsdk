import { GoogleGenAI } from "@google/genai";
import {
  AIProvider,
  type ExecuteRequest,
  type ExecuteResult,
} from "./base-provider";
import type { IPromptExecutionLogger } from "./logger/execution-logger";
import {
  buildGoogleRequest,
  googleResult,
  splitGoogleContents,
  type GoogleUsageMetadata,
} from "./google-codec";

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
    const { model, messages, variables, google_settings, projectId, promptSlug } = request;

    // Log variables if provided
    if (variables) {
      await this.logger.logVariables({ variables });
    }

    try {
      const { systemInstruction } = splitGoogleContents(messages);
      const cachedContentName = await this.getCachedContentName({
        model,
        googleSettings: google_settings,
        systemInstruction,
        projectId,
        promptSlug,
      });
      const { config, contents } = buildGoogleRequest(request, cachedContentName);

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

      const result = googleResult({ model, outputText, usageMetadata, durationMs, tier: "standard" });

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
