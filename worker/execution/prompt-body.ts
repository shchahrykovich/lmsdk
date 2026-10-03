import type {
  AIMessage,
  AnthropicSettings,
  GoogleSettings,
  OpenAISettings,
  OpenRouterSettings,
  ResponseFormat,
} from "../providers/base-provider";

export interface PromptBody {
  messages: AIMessage[];
  response_format?: ResponseFormat;
  openai_settings?: OpenAISettings;
  google_settings?: GoogleSettings;
  openrouter_settings?: OpenRouterSettings;
  anthropic_settings?: AnthropicSettings;
  proxy?: "none" | "cloudflare";
}

export function parsePromptBody(rawBody: string): PromptBody | null {
  if (!rawBody) return null;
  try {
    const parsed = JSON.parse(rawBody) as Partial<PromptBody> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return { ...parsed, messages: Array.isArray(parsed.messages) ? parsed.messages : [] };
  } catch {
    return null;
  }
}
