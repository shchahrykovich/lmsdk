import OpenAI from "openai";
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

  constructor(apiKey: string, logger: IPromptExecutionLogger) {
    super(apiKey);
    this.client = new OpenAI({ apiKey: this.apiKey });
    this.logger = logger;
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

    // Log input
    await this.logger.logInput({
      input: {
        model,
        messages,
        response_format,
        openai_settings,
      },
    });

    // Log variables if provided
    if (variables) {
      await this.logger.logVariables({ variables });
    }

    try {
      // Convert messages to OpenAI Responses API format
      const inputMessages = messages.map((msg) => ({
        role: msg.role === "system" ? "developer" : msg.role,
        content: [
          {
            type: "input_text",
            text: msg.content,
          },
        ],
      }));

      // Build text format configuration
      let textFormat: any = {
        format: {
          type: "text",
        },
        verbosity: "medium",
      };

      // If JSON schema is specified, configure structured output
      if (response_format?.type === "json_schema" && response_format.json_schema) {
        const schema = response_format.json_schema;
        textFormat = {
          format: {
            type: "json_schema",
            name: schema.name || "response",
            strict: schema.strict !== undefined ? schema.strict : true,
            schema: schema.schema || schema,
          },
          verbosity: "medium",
        };
      }

      // Build reasoning configuration from settings (with defaults)
      const reasoningConfig = {
        effort: openai_settings?.reasoning_effort || "medium",
        summary: openai_settings?.reasoning_summary || "auto",
      };

      // Build include array based on settings
      const includeArray: string[] = [];
      if (openai_settings?.include_encrypted_reasoning !== false) {
        includeArray.push("reasoning.encrypted_content");
      }

      // Execute the prompt using responses.create
      const response = await this.client.responses.create({
        model: model,
        input: inputMessages as any,
        text: textFormat,
        reasoning: reasoningConfig,
        tools: [],
        store: openai_settings?.store !== false, // Default to true
        include: includeArray,
      } as any);

      // Extract output text from response
      let outputText = "";
      if (response.output && Array.isArray(response.output)) {
        // Find the message output item
        const messageOutput = response.output.find(
          (item: any) => item.type === "message"
        ) as any;
        if (messageOutput && messageOutput.content) {
          // Extract text from content array
          const textContent = messageOutput.content.find(
            (c: any) => c.type === "output_text"
          );
          outputText = textContent?.text || "";
        }
      }

      const result = {
        content: outputText,
        model: response.model,
        usage: {
          prompt_tokens: response.usage?.input_tokens || 0,
          completion_tokens: response.usage?.output_tokens || 0,
          total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        },
      };

      // Log output
      await this.logger.logOutput({
        output: response,
      });

      await this.logger.logResult({
        output: result,
      });

      // Log successful execution
      const durationMs = Date.now() - startTime;
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
}
