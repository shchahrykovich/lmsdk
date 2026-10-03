import OpenAI from "openai";
import {
  AIProvider,
  type ExecuteRequest,
  type ExecuteResult,
} from "./base-provider";
import type { IPromptExecutionLogger } from "./logger/execution-logger";
import { buildOpenAIRequest, openAIResult } from "./openai-codec";

/**
 * OpenAI provider implementation
 * Uses OpenAI Responses API for executing prompts
 */
export class OpenAIProvider extends AIProvider {
  private client: OpenAI;
  protected logger: IPromptExecutionLogger;
  private proxyConfig?: { token?: string; baseUrl?: string };

  constructor(
    apiKey: string,
    logger: IPromptExecutionLogger,
    proxyConfig?: { token?: string; baseUrl?: string }
  ) {
    super(apiKey);
    this.client = new OpenAI({ apiKey: this.apiKey });
    this.logger = logger;
    this.proxyConfig = proxyConfig;
  }

  getProviderName(): string {
    return "openai";
  }

  isModelSupported(model: string): boolean {
    // Basic validation - could be enhanced with a model list
    return model.length > 0;
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    const startTime = Date.now();

    await this.logVariablesIfNeeded(request.variables);

    try {
      const requestPayload = buildOpenAIRequest(request);

      await this.logger.logInput({ input: requestPayload });

      const client = this.getClient(request);

      // Execute the prompt using responses.create
      const response = await client.responses.create(requestPayload);

      const durationMs = Date.now() - startTime;
      const result = openAIResult({ requestedModel: request.model, response, durationMs, tier: "standard" });

      // Log output
      await this.logger.logOutput({
        output: response,
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

  private async logVariablesIfNeeded(variables: ExecuteRequest["variables"]) {
    if (!variables) {
      return;
    }
    await this.logger.logVariables({ variables });
  }

  private getClient(request: ExecuteRequest): OpenAI {
    if (request.proxy !== "cloudflare") {
      return this.client;
    }

    if (!this.proxyConfig?.token || !this.proxyConfig?.baseUrl) {
      return this.client;
    }

    const headers: Record<string, string> = {
      "cf-aig-authorization": `Bearer ${this.proxyConfig.token}`,
    };

    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.proxyConfig.baseUrl + '/openai',
      defaultHeaders: headers,
    });
  }
}
