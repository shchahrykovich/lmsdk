import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import {
  AIProvider,
  type ExecuteRequest,
  type ExecuteResult,
} from "./base-provider";
import type { IPromptExecutionLogger } from "./logger/execution-logger";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_TIMEOUT_MS = 240_000;
export const OPENROUTER_MAX_RETRIES = 0;

type OpenRouterSettings = NonNullable<ExecuteRequest["openrouter_settings"]>;

type OpenRouterRequest = ChatCompletionCreateParamsNonStreaming & {
  provider?: { require_parameters?: boolean; sort?: OpenRouterSettings["provider_sort"] };
  reasoning?: { effort: NonNullable<OpenRouterSettings["reasoning_effort"]> };
};

interface OpenRouterErrorObject {
  code?: number | string;
  message?: string;
}

type OpenRouterChoice = Omit<ChatCompletion["choices"][number], "finish_reason"> & {
  finish_reason: string | null;
  error?: OpenRouterErrorObject;
};

type OpenRouterUsage = NonNullable<ChatCompletion["usage"]> & {
  cost?: number;
};

type OpenRouterResponse = Omit<Partial<ChatCompletion>, "choices" | "usage"> & {
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
  error?: OpenRouterErrorObject;
};

export class OpenRouterProvider extends AIProvider {
  private client: OpenAI;
  protected logger: IPromptExecutionLogger;
  private proxyConfig?: { token?: string; baseUrl?: string };

  constructor(
    apiKey: string,
    logger: IPromptExecutionLogger,
    proxyConfig?: { token?: string; baseUrl?: string }
  ) {
    super(apiKey);
    this.client = this.createClient(OPENROUTER_BASE_URL);
    this.logger = logger;
    this.proxyConfig = proxyConfig;
  }

  getProviderName(): string {
    return "openrouter";
  }

  isModelSupported(model: string): boolean {
    return model.length > 0;
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    const startTime = Date.now();

    if (request.variables) {
      await this.logger.logVariables({ variables: request.variables });
    }

    try {
      const payload = this.buildRequestPayload(request);
      await this.logger.logInput({ input: payload });

      const response = (await this.getClient(request).chat.completions.create(payload)) as OpenRouterResponse;
      await this.logger.logOutput({ output: response });

      const choice = this.firstChoiceOrThrow(response);
      const durationMs = Date.now() - startTime;
      const result = this.buildResult(request.model, response, choice, durationMs);

      await this.logger.logResult({ output: result });
      await this.logger.logSuccess({ durationMs });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logger.logError({ durationMs, errorMessage });
      throw error;
    }
  }

  private buildResult(
    requestedModel: string,
    response: OpenRouterResponse,
    choice: OpenRouterChoice,
    durationMs: number
  ): ExecuteResult {
    return {
      content: choice.message?.content ?? "",
      model: response.model ?? requestedModel,
      usage: this.buildUsage(response.usage),
      duration_ms: durationMs,
    };
  }

  private buildUsage(usage: OpenRouterUsage | undefined): ExecuteResult["usage"] {
    return {
      prompt_tokens: usage?.prompt_tokens ?? 0,
      completion_tokens: usage?.completion_tokens ?? 0,
      total_tokens: usage?.total_tokens ?? 0,
      ...this.buildUsageDetails(usage),
    };
  }

  private buildUsageDetails(
    usage: OpenRouterUsage | undefined
  ): Pick<ExecuteResult["usage"], "cached_tokens" | "reasoning_tokens" | "cost"> {
    const details = {
      cached_tokens: usage?.prompt_tokens_details?.cached_tokens,
      reasoning_tokens: usage?.completion_tokens_details?.reasoning_tokens,
      cost: usage?.cost,
    };
    return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
  }

  private buildRequestPayload(request: ExecuteRequest): OpenRouterRequest {
    const payload: OpenRouterRequest = {
      model: request.model,
      messages: request.messages.map((msg) => ({ role: msg.role, content: msg.content })),
    };

    const responseFormat = this.buildResponseFormat(request.response_format);
    if (responseFormat) {
      payload.response_format = responseFormat;
    }

    const providerRouting = this.buildProviderRouting(Boolean(responseFormat), request.openrouter_settings);
    if (providerRouting) {
      payload.provider = providerRouting;
    }

    const settings = request.openrouter_settings;
    if (settings?.reasoning_effort) {
      payload.reasoning = { effort: settings.reasoning_effort };
    }
    if (settings?.temperature !== undefined) {
      payload.temperature = settings.temperature;
    }
    if (settings?.max_tokens !== undefined) {
      payload.max_tokens = settings.max_tokens;
    }

    return payload;
  }

  private buildProviderRouting(
    requiresResponseFormat: boolean,
    settings: ExecuteRequest["openrouter_settings"]
  ): OpenRouterRequest["provider"] | undefined {
    const routing: NonNullable<OpenRouterRequest["provider"]> = {};
    if (requiresResponseFormat) {
      routing.require_parameters = true;
    }
    if (settings?.provider_sort) {
      routing.sort = settings.provider_sort;
    }
    return Object.keys(routing).length > 0 ? routing : undefined;
  }

  private buildResponseFormat(
    responseFormat: ExecuteRequest["response_format"]
  ): OpenRouterRequest["response_format"] | undefined {
    if (responseFormat?.type === "json_schema" && responseFormat.json_schema) {
      const jsonSchema = responseFormat.json_schema;
      return {
        type: "json_schema",
        json_schema: {
          name: jsonSchema.name ?? "response",
          strict: jsonSchema.strict ?? true,
          schema: (jsonSchema.schema ?? jsonSchema) as Record<string, unknown>,
        },
      };
    }

    if (responseFormat?.type === "json") {
      return { type: "json_object" };
    }

    return undefined;
  }

  private firstChoiceOrThrow(response: OpenRouterResponse): OpenRouterChoice {
    const choice = response.choices?.[0];
    if (!choice) {
      throw this.openRouterError(response.error, "response has no choices");
    }
    if (choice.finish_reason === "error") {
      throw this.openRouterError(choice.error ?? response.error, "the model finished with an error");
    }
    return choice;
  }

  private openRouterError(error: OpenRouterErrorObject | undefined, fallbackMessage: string): Error {
    return new Error(`OpenRouter error ${error?.code ?? "unknown"}: ${error?.message ?? fallbackMessage}`);
  }

  private getClient(request: ExecuteRequest): OpenAI {
    if (request.proxy !== "cloudflare") {
      return this.client;
    }

    if (!this.proxyConfig?.token || !this.proxyConfig?.baseUrl) {
      return this.client;
    }

    return this.createClient(this.proxyConfig.baseUrl + "/openrouter", {
      "cf-aig-authorization": `Bearer ${this.proxyConfig.token}`,
    });
  }

  private createClient(baseURL: string, defaultHeaders?: Record<string, string>): OpenAI {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL,
      timeout: OPENROUTER_TIMEOUT_MS,
      maxRetries: OPENROUTER_MAX_RETRIES,
      ...(defaultHeaders ? { defaultHeaders } : {}),
    });
  }
}
