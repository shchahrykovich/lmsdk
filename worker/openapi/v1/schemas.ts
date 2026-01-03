import { Str } from "chanfana";
import { z } from "zod";

// Response schemas
export const WhoamiResponse = z.object({
	ok: z.boolean().describe("Whether the API key is valid"),
});

export const ExecutePromptResponse = z.object({
  response: z.string().or(z.object({}).passthrough()).describe("The generated response from the AI model"),
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
});
