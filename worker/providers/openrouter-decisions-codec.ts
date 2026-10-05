import type { AIMessage, DecisionQuestions, ExecuteRequest, ExecuteResult } from "./base-provider";

export interface DecisionsRequest {
  model: string;
  state: unknown;
  questions: DecisionQuestions;
}

export interface DecisionsResponse {
  id?: string;
  model?: string;
  provider?: string;
  answers?: Record<string, unknown>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
}

export function buildDecisionsRequest(request: ExecuteRequest): DecisionsRequest {
  const questions = request.decision_questions;
  if (!questions || Object.keys(questions).length === 0) {
    throw new Error("Decisions need at least one question");
  }
  return { model: request.model, state: decisionState(request.messages), questions };
}

export function decisionState(messages: AIMessage[]): unknown {
  const text = messages
    .filter((message) => message.role !== "system")
    .map((message) => message.content)
    .filter((content) => content.trim().length > 0)
    .join("\n\n");
  if (!text) {
    throw new Error("Decisions need a state: add a user message");
  }
  const parsed = parseJson(text);
  const state: unknown = isStructured(parsed) ? parsed : text;
  return state;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

const isStructured = (value: unknown): value is object => typeof value === "object" && value !== null;

export function decisionsResult(
  requestedModel: string,
  response: DecisionsResponse,
  durationMs: number
): ExecuteResult {
  if (!response.answers) {
    throw new Error("OpenRouter Decisions response has no answers");
  }
  const promptTokens = response.usage?.input_tokens ?? 0;
  const completionTokens = response.usage?.output_tokens ?? 0;
  return {
    content: JSON.stringify(response.answers),
    model: response.model ?? requestedModel,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      ...(response.usage?.cost !== undefined ? { cost: response.usage.cost } : {}),
    },
    duration_ms: durationMs,
  };
}
