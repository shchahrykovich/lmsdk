import { describe, it, expect } from "vitest";
import {
  HttpError,
  ClientInputValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from "../../../worker/shared/errors";

describe("HttpError classes", () => {
  describe("HttpError", () => {
    it("should create HttpError with message and status code", () => {
      const error = new HttpError("Test error", 418);

      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(418);
      expect(error.name).toBe("HttpError");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof HttpError).toBe(true);
    });
  });

  describe("ClientInputValidationError", () => {
    it("should create error with 400 status code", () => {
      const error = new ClientInputValidationError("Invalid input");

      expect(error.message).toBe("Invalid input");
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe("ClientInputValidationError");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof HttpError).toBe(true);
      expect(error instanceof ClientInputValidationError).toBe(true);
    });
  });

  describe("NotFoundError", () => {
    it("should create error with 404 status code", () => {
      const error = new NotFoundError("Resource not found");

      expect(error.message).toBe("Resource not found");
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe("NotFoundError");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof HttpError).toBe(true);
      expect(error instanceof NotFoundError).toBe(true);
    });
  });

  describe("ConflictError", () => {
    it("should create error with 409 status code", () => {
      const error = new ConflictError("Resource already exists");

      expect(error.message).toBe("Resource already exists");
      expect(error.statusCode).toBe(409);
      expect(error.name).toBe("ConflictError");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof HttpError).toBe(true);
      expect(error instanceof ConflictError).toBe(true);
    });
  });

  describe("UnauthorizedError", () => {
    it("should create error with 401 status code", () => {
      const error = new UnauthorizedError("Authentication required");

      expect(error.message).toBe("Authentication required");
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe("UnauthorizedError");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof HttpError).toBe(true);
      expect(error instanceof UnauthorizedError).toBe(true);
    });
  });

  describe("ForbiddenError", () => {
    it("should create error with 403 status code", () => {
      const error = new ForbiddenError("Access denied");

      expect(error.message).toBe("Access denied");
      expect(error.statusCode).toBe(403);
      expect(error.name).toBe("ForbiddenError");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof HttpError).toBe(true);
      expect(error instanceof ForbiddenError).toBe(true);
    });
  });

  describe("instanceof checks", () => {
    it("should distinguish between different error types", () => {
      const validationError = new ClientInputValidationError("Invalid");
      const notFoundError = new NotFoundError("Not found");
      const conflictError = new ConflictError("Conflict");

      // All are HttpErrors
      expect(validationError instanceof HttpError).toBe(true);
      expect(notFoundError instanceof HttpError).toBe(true);
      expect(conflictError instanceof HttpError).toBe(true);

      // But they are not instances of each other
      expect(validationError instanceof NotFoundError).toBe(false);
      expect(validationError instanceof ConflictError).toBe(false);
      expect(notFoundError instanceof ClientInputValidationError).toBe(false);
      expect(notFoundError instanceof ConflictError).toBe(false);
      expect(conflictError instanceof ClientInputValidationError).toBe(false);
      expect(conflictError instanceof NotFoundError).toBe(false);
    });
  });
});
