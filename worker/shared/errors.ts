/**
 * Base class for HTTP errors
 */
export class HttpError extends Error {
	public statusCode: number;

  constructor(
    message: string,
    statusCode: number
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

/**
 * Validation error thrown when input validation fails (400)
 */
export class ClientInputValidationError extends HttpError {
  constructor(message: string) {
    super(message, 400);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(message, 404);
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends HttpError {
  constructor(message: string) {
    super(message, 409);
  }
}

/**
 * Unprocessable entity error (422)
 */
export class UnprocessableEntityError extends HttpError {
  constructor(message: string) {
    super(message, 422);
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(message, 401);
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(message, 403);
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current.message.includes("UNIQUE constraint failed")) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export async function conflictOnDuplicate<T>(action: () => Promise<T>, message: string): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(message);
    }
    throw error;
  }
}
