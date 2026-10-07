import { Str } from "chanfana";
import { z } from "zod";

// Response schemas
export const WhoamiResponse = z.object({
	ok: z.boolean().describe("Whether the API key is valid"),
});

export const ExecutePromptResponse = z.object({
  response: z.string().or(z.object({}).passthrough()).describe("The generated response from the AI model. For OpenRouter Decisions: the answers object, one entry per decision question"),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
      cached_tokens: z.number().optional().describe("Prompt tokens read from the provider cache (OpenAI, Anthropic, OpenRouter)"),
      cache_creation_tokens: z.number().optional().describe("Anthropic: prompt tokens written to the cache"),
      reasoning_tokens: z.number().optional().describe("Output tokens spent on reasoning (OpenAI, OpenRouter)"),
      cost: z
        .number()
        .optional()
        .describe(
          "Cost in USD. OpenRouter and OpenRouter Decisions report it. For OpenAI, Google and Anthropic, LM SDK computes it from its price table at the standard price. Left out when the model has no price in the table."
        ),
    })
    .passthrough()
    .describe("Token usage reported by the provider"),
  model: z.string().describe("Model that answered, as reported by the provider"),
  provider: z.string().describe("Provider of the prompt version that ran"),
  version: z.number().describe("Prompt version that ran"),
  logId: z.number().nullable().describe("Id of the execution log entry, or null when no entry was written"),
});

export const PromptVersionsResponse = z.array(
  z.object({
    version: z.number().describe("Prompt version number"),
    createdAt: z.string().describe("Version creation time (ISO 8601)"),
  })
);

export const PromptVersionResponse = z.object({
  version: z.number().describe("Prompt version number"),
  name: z.string().describe("Prompt name at this version"),
  slug: z.string().describe("Prompt slug at this version"),
  body: z.any().describe("Prompt body at this version"),
  createdAt: z.string().describe("Version creation time (ISO 8601)"),
});

export const ErrorResponse = z.object({
  error: Str({ description: "Error message" }),
  code: z.enum(["provider_timeout"]).optional().describe("Stable error code for errors that clients handle in a special way"),
});
