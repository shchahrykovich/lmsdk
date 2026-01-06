import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseOutputMessage,
  ResponseOutputText,
} from "openai/resources/responses/responses";
import {
  AIProvider,
  type ExecuteRequest,
  type ExecuteResult,
} from "./base-provider";
import type { IPromptExecutionLogger } from "./logger/execution-logger";

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
    const { model, messages, response_format, openai_settings, variables } = request;

    await this.logVariablesIfNeeded(variables);

    try {
      const inputMessages = this.buildInputMessages(messages);
      const textFormat = this.buildTextFormat(response_format);
      const reasoningConfig = this.buildReasoningConfig(openai_settings);
      const includeArray = this.buildIncludeArray(openai_settings);
      const store = openai_settings?.store !== false;
			const requestPayload = this.buildRequestPayload({
        model,
        inputMessages,
        textFormat,
        reasoningConfig,
				// @ts-expect-error no type
        includeArray,
        store,
      });

      await this.logger.logInput({ input: requestPayload });

      const client = this.getClient(request);

      // Execute the prompt using responses.create
      const response = await client.responses.create(requestPayload);
      const outputText = this.extractOutputText(response);

      const durationMs = Date.now() - startTime;
      const result = {
        content: outputText,
        model: response.model,
        usage: {
          prompt_tokens: response.usage?.input_tokens ?? 0,
          completion_tokens: response.usage?.output_tokens ?? 0,
          total_tokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
        },
        duration_ms: durationMs,
      };

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

  private buildInputMessages(messages: ExecuteRequest["messages"]) {
    return messages.map((msg) => ({
      role: msg.role === "system" ? "developer" : msg.role,
      content: [
        {
          type: "input_text",
          text: msg.content,
        },
      ],
    }));
  }

  private async logVariablesIfNeeded(variables: ExecuteRequest["variables"]) {
    if (!variables) {
      return;
    }
    await this.logger.logVariables({ variables });
  }

  private buildTextFormat(responseFormat: ExecuteRequest["response_format"]): ResponseTextConfig {
    if (responseFormat?.type === "json_schema" && responseFormat.json_schema) {
      const schema = responseFormat.json_schema;
      return {
        format: {
          type: "json_schema",
          name: schema.name ?? "response",
          strict: schema.strict ?? true,
					// @ts-expect-error no type
          schema: schema.schema ?? schema,
        },
        verbosity: "medium",
      };
    }

    return {
      format: {
        type: "text",
      },
      verbosity: "medium",
    };
  }

  private buildReasoningConfig(openaiSettings: ExecuteRequest["openai_settings"]): Reasoning | null {
		return {
      effort: openaiSettings?.reasoning_effort ?? "medium",
			// @ts-expect-error no type
      summary: openaiSettings?.reasoning_summary ?? "auto",
    };
  }

  private buildIncludeArray(openaiSettings: ExecuteRequest["openai_settings"]) {
    return openaiSettings?.include_encrypted_reasoning !== false
      ? ["reasoning.encrypted_content"]
      : [];
  }

  private buildRequestPayload(params: {
    model: string;
    inputMessages: ReturnType<OpenAIProvider["buildInputMessages"]>;
    textFormat: ResponseTextConfig;
    reasoningConfig: Reasoning | null;
    includeArray: ResponseIncludable[];
    store: boolean;
  }): ResponseCreateParamsNonStreaming {
    const { model, inputMessages, textFormat, reasoningConfig, includeArray, store } = params;
    return {
      model,
      input: inputMessages as ResponseCreateParamsNonStreaming["input"],
      text: textFormat,
      reasoning: reasoningConfig,
      tools: [],
      store,
      include: includeArray,
    };
  }

  private extractOutputText(response: Response): string {
    if (!response.output || !Array.isArray(response.output)) {
      return "";
    }

    const messageOutput = response.output.find(
      (item): item is ResponseOutputMessage => item.type === "message"
    );
    const textContent = messageOutput?.content?.find(
      (content): content is ResponseOutputText => content.type === "output_text"
    );
    return textContent?.text ?? "";
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
