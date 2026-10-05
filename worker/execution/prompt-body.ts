import type {
  AIMessage,
  AnthropicSettings,
  DecisionQuestions,
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
  decision_questions?: DecisionQuestions;
  proxy?: "none" | "cloudflare";
}

export function parsePromptBody(rawBody: string): PromptBody | null {
  if (!rawBody) return null;
  try {
    const parsed = JSON.parse(rawBody) as Partial<PromptBody> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const body: PromptBody = { ...parsed, messages: Array.isArray(parsed.messages) ? parsed.messages : [] };
    return withDecisionQuestions(body);
  } catch {
    return null;
  }
}

function withDecisionQuestions(body: PromptBody): PromptBody {
  const { decision_questions: questions, ...rest } = body;
  if (!isQuestionMap(questions)) return rest;
  return { ...rest, decision_questions: questions, response_format: { type: "json" } };
}

const isQuestionMap = (value: unknown): value is DecisionQuestions =>
  typeof value === "object" && value !== null && !Array.isArray(value);
