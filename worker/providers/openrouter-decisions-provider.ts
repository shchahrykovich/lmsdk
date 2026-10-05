import { AIProvider, type ExecuteRequest, type ExecuteResult } from "./base-provider";
import type { IPromptExecutionLogger } from "./logger/execution-logger";
import { ProviderTimeoutError } from "./provider-timeout-error";
import {
  buildDecisionsRequest,
  decisionsResult,
  type DecisionsRequest,
  type DecisionsResponse,
} from "./openrouter-decisions-codec";

export const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const OPENROUTER_DECISIONS_TIMEOUT_MS = 60_000;

export class OpenRouterDecisionsError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`OpenRouter Decisions error ${status}: ${message}`);
    this.name = "OpenRouterDecisionsError";
    this.status = status;
  }
}

export class OpenRouterDecisionsProvider extends AIProvider {
  protected logger: IPromptExecutionLogger;

  constructor(apiKey: string, logger: IPromptExecutionLogger) {
    super(apiKey);
    this.logger = logger;
  }

  getProviderName(): string {
    return "openrouter-decisions";
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
      const payload = buildDecisionsRequest(request);
      await this.logger.logInput({ input: payload });

      const response = await this.post(payload);
      await this.logger.logOutput({ output: response });

      const durationMs = Date.now() - startTime;
      const result = decisionsResult(request.model, response, durationMs);

      await this.logger.logResult({ output: result });
      await this.logger.logSuccess({ durationMs });

      return result;
    } catch (error) {
      const failure = this.toProviderFailure(error);
      const durationMs = Date.now() - startTime;
      const errorMessage = failure instanceof Error ? failure.message : String(failure);
      await this.logger.logError({ durationMs, errorMessage });
      throw failure;
    }
  }

  private async post(payload: DecisionsRequest): Promise<DecisionsResponse> {
    const response = await fetch(OPENROUTER_DECISIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(OPENROUTER_DECISIONS_TIMEOUT_MS),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new OpenRouterDecisionsError(response.status, this.errorMessage(text));
    }
    return JSON.parse(text) as DecisionsResponse;
  }

  private errorMessage(text: string): string {
    try {
      const body = JSON.parse(text) as { error?: { message?: unknown } };
      if (typeof body.error?.message === "string") {
        return body.error.message;
      }
    } catch {
      return text || "no error details";
    }
    return text || "no error details";
  }

  private toProviderFailure(error: unknown): unknown {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return new ProviderTimeoutError("OpenRouter Decisions", OPENROUTER_DECISIONS_TIMEOUT_MS);
    }
    return error;
  }
}
