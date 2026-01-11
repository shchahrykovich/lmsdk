import type { Context } from "hono";
import type { HonoEnv } from "../routes/app";
import { HttpError } from "../shared/errors";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Global error handler middleware
 * Converts exceptions into appropriate HTTP error responses
 *
 * Usage:
 * ```typescript
 * import { errorHandler } from "./middleware/error-handler.middleware";
 * app.onError(errorHandler);
 * ```
 *
 * Supported error types:
 * - HttpError and subclasses (ClientInputValidationError, NotFoundError, etc.) → Use statusCode from error
 * - Generic Error → 500 Internal Server Error
 */
export const errorHandler = (err: Error, c: Context<HonoEnv>): Response => {
  console.error("Error handler caught:", err);

  // Handle HttpError and its subclasses (ClientInputValidationError, NotFoundError, etc.)
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.statusCode as ContentfulStatusCode);
  }

  // Handle generic errors as 500
  return c.json(
    {
      error: err.message || "Internal server error"
    },
    500
  );
};
