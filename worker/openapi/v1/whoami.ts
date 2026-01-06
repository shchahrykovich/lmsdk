import { OpenAPIRoute } from "chanfana";
import { z } from "zod";

export class V1Whoami extends OpenAPIRoute {
  schema = {
    tags: ["v1"],
    summary: "Verify API Key",
    description: "Returns authentication status when authenticated with a valid API key",
    security: [{ apiKey: [] }],
    responses: {
      "200": {
        description: "API key is valid",
        content: {
          "application/json": {
            schema: z.object({
                success: z.boolean(),
                result: z.object({
                  ok: z.boolean(),
                }),
            }) as z.ZodTypeAny,
          },
        },
      },
    },
  };

  handle(): { ok: boolean } {
    return {
      ok: true,
    };
  }
}
