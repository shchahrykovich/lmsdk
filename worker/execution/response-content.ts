import type { ResponseFormat } from "../providers/base-provider";

export const expectsJson = (responseFormat?: ResponseFormat): boolean =>
  responseFormat?.type === "json_schema" || responseFormat?.type === "json";

export function parseResponseContent(content: string, responseFormat?: ResponseFormat): unknown {
  if (!expectsJson(responseFormat)) {
    return content;
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content;
  }
}
