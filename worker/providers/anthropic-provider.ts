import Anthropic from "@anthropic-ai/sdk";
import { AIProvider, type ExecuteRequest, type ExecuteResult } from "./base-provider";
import type { IPromptExecutionLogger } from "./logger/execution-logger";
import { anthropicResult, buildAnthropicRequest } from "./anthropic-codec";

export class AnthropicProvider extends AIProvider {
  private client: Anthropic;
  protected logger: IPromptExecutionLogger;
  private proxyConfig?: { token?: string; baseUrl?: string };

  constructor(apiKey: string, logger: IPromptExecutionLogger, proxyConfig?: { token?: string; baseUrl?: string }) {
    super(apiKey);
    this.client = new Anthropic({ apiKey: this.apiKey });
    this.logger = logger;
    this.proxyConfig = proxyConfig;
  }

  getProviderName(): string {
    return "anthropic";
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
      const payload = buildAnthropicRequest(request);
      await this.logger.logInput({ input: payload });

      const message = await this.getClient(request).messages.stream(payload).finalMessage();
      await this.logger.logOutput({ output: message });

      const durationMs = Date.now() - startTime;
      const result = anthropicResult({ requestedModel: request.model, message, durationMs, tier: "standard" });

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

  private getClient(request: ExecuteRequest): Anthropic {
    if (request.proxy !== "cloudflare" || !this.proxyConfig?.token || !this.proxyConfig?.baseUrl) {
      return this.client;
    }
    return new Anthropic({
      apiKey: this.apiKey,
      baseURL: this.proxyConfig.baseUrl + "/anthropic",
      defaultHeaders: { "cf-aig-authorization": `Bearer ${this.proxyConfig.token}` },
    });
  }
}
