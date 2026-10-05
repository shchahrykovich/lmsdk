import type { AIMessage, ExecuteRequest } from "../providers/base-provider";
import { replaceAllVariables } from "../utils/variable-replacer";
import type { PromptBody } from "./prompt-body";

export interface PromptVersionSource {
  model: string;
  projectId: number;
  slug: string;
}

export function buildExecuteRequest(
  version: PromptVersionSource,
  body: PromptBody,
  variables?: Record<string, unknown>
): ExecuteRequest {
  return {
    model: version.model,
    messages: body.messages,
    variables,
    response_format: body.response_format,
    openai_settings: body.openai_settings,
    google_settings: body.google_settings,
    openrouter_settings: body.openrouter_settings,
    anthropic_settings: body.anthropic_settings,
    decision_questions: body.decision_questions,
    proxy: body.proxy,
    projectId: version.projectId,
    promptSlug: version.slug,
  };
}

export function renderMessages(messages: AIMessage[], variables?: Record<string, unknown>): AIMessage[] {
  if (!variables) return messages;
  return messages.map((message) => ({ ...message, content: replaceAllVariables(message.content, variables) }));
}

export function renderExecuteRequest(request: ExecuteRequest): ExecuteRequest {
  return { ...request, messages: renderMessages(request.messages, request.variables) };
}
