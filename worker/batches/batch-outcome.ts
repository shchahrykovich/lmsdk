import type { ResponseFormat } from "../providers/base-provider";
import { parseResponseContent } from "../execution/response-content";
import type { ItemOutcome } from "./adapters/batch-adapter";
import type { ItemCompletion } from "./batch-item.repository";

export interface StoredItemResult {
  result: unknown;
  model: string;
}

export function toCompletion(
  itemId: number,
  outcome: ItemOutcome,
  responseFormat: ResponseFormat | undefined
): { completion: ItemCompletion; stored?: StoredItemResult } {
  switch (outcome.kind) {
    case "succeeded": {
      const usage = outcome.result.usage;
      return {
        completion: {
          id: itemId,
          status: "succeeded",
          usage: JSON.stringify(usage),
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          costUsd: usage.cost ?? null,
          hasResult: true,
        },
        stored: { result: parseResponseContent(outcome.result.content, responseFormat), model: outcome.result.model },
      };
    }
    case "errored":
      return { completion: { id: itemId, status: "errored", error: JSON.stringify(outcome.error) } };
    case "expired":
      return { completion: { id: itemId, status: "expired" } };
    case "cancelled":
      return { completion: { id: itemId, status: "cancelled" } };
  }
}
