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
