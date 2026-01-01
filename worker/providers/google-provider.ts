import { GoogleGenAI } from "@google/genai";
import {
  AIProvider,
  type ExecuteRequest,
  type ExecuteResult,
} from "./base-provider";
import type { IPromptExecutionLogger } from "./logger/execution-logger";

/**
 * Google Gemini provider implementation
 * Uses Google GenAI SDK for executing prompts
 */
export class GoogleProvider extends AIProvider {
  private client: GoogleGenAI;
  protected logger: IPromptExecutionLogger;

  constructor(apiKey: string, logger: IPromptExecutionLogger) {
    super(apiKey);
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    this.logger = logger;
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
    const { model, messages, response_format, variables, google_settings } = request;

    // Log variables if provided
    if (variables) {
      await this.logger.logVariables({ variables });
    }

    try {
      // Convert messages to Gemini format
      // Build system instruction from system messages
      let systemInstruction = "";
      const contents = [];

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

      // If no user messages, create one from system message
      if (contents.length === 0 && systemInstruction) {
        contents.push({
          role: "user",
          parts: [{ text: systemInstruction }],
        });
        systemInstruction = "";
      }

      // Build generation config
      const config: any = {};

      // Add system instruction if present
      if (systemInstruction.trim()) {
        config.systemInstruction = systemInstruction.trim();
      }

      // If JSON mode is requested
      if (response_format?.type === "json_schema" || response_format?.type === "json") {
        config.responseMimeType = "application/json";

        // If there's a schema, add it
        if (response_format.json_schema) {
          config.responseSchema = response_format.json_schema.schema || response_format.json_schema;
        }
      }

      // Add Google thinking settings if provided
      if (google_settings) {
        const thinkingConfig: any = {};

        if (google_settings.include_thoughts !== undefined) {
          thinkingConfig.includeThoughts = google_settings.include_thoughts;
        }

        // CRITICAL: Google API only allows ONE of thinking_budget OR thinking_level, not both
        // Priority: thinking_budget > thinking_level > neither
        if (google_settings.thinking_budget !== undefined && google_settings.thinking_budget > 0) {
          // Use thinking_budget if explicitly set (> 0)
          thinkingConfig.thinkingBudget = google_settings.thinking_budget;
        } else if (google_settings.thinking_level && google_settings.thinking_level !== "THINKING_LEVEL_UNSPECIFIED") {
          // Use thinking_level if it's set to a specific value
          thinkingConfig.thinkingLevel = google_settings.thinking_level;
        }
        // If thinking_budget is 0 or -1, and thinking_level is unspecified, send neither

        // Only add thinkingConfig if it has properties
        if (Object.keys(thinkingConfig).length > 0) {
          config.thinkingConfig = thinkingConfig;
        }

        // Add tools if enabled
        if (google_settings.google_search_enabled) {
          config.tools = [{ type: 'google_search' }];
        }
      }

      // Log input
      await this.logger.logInput({
        input: {
          model: model,
          config: config,
          contents: contents,
        },
      });

      // Execute the request using generateContentStream
      const response: any = await this.client.models.generateContentStream({
        model: model,
        config: config,
        contents: contents,
      });

      // Collect the streamed response
      let outputText = "";
      const chunks = [];
      for await (const chunk of response) {
        chunks.push(chunk);
        if (chunk.text) {
          outputText += chunk.text;
        }
      }

      // Note: Usage metadata is not available in streaming mode
      // You would need to use generateContent (non-streaming) to get usage data
      const result = {
        content: outputText,
        model: model,
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };

      // Log output
      await this.logger.logOutput({
        output: chunks,
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
