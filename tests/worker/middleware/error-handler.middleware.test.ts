import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { errorHandler } from "../../../worker/middleware/error-handler.middleware";
import {
  HttpError,
  ClientInputValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from "../../../worker/shared/errors";

describe("errorHandler middleware", () => {
  it("should handle ClientInputValidationError with 400 status", async () => {
    const app = new Hono();
    app.onError(errorHandler);

    app.get("/test", () => {
      throw new ClientInputValidationError("Invalid input");
    });

    const res = await app.request("/test");
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid input" });
  });

  it("should handle NotFoundError with 404 status", async () => {
    const app = new Hono();
    app.onError(errorHandler);

    app.get("/test", () => {
      throw new NotFoundError("Resource not found");
    });

    const res = await app.request("/test");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Resource not found" });
  });

  it("should handle ConflictError with 409 status", async () => {
    const app = new Hono();
    app.onError(errorHandler);

    app.get("/test", () => {
      throw new ConflictError("Resource already exists");
    });

    const res = await app.request("/test");
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({ error: "Resource already exists" });
  });

  it("should handle UnauthorizedError with 401 status", async () => {
    const app = new Hono();
    app.onError(errorHandler);

    app.get("/test", () => {
      throw new UnauthorizedError("Authentication required");
    });

    const res = await app.request("/test");
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Authentication required" });
  });

  it("should handle ForbiddenError with 403 status", async () => {
    const app = new Hono();
    app.onError(errorHandler);

    app.get("/test", () => {
      throw new ForbiddenError("Access denied");
    });

    const res = await app.request("/test");
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Access denied" });
  });

  it("should handle custom HttpError with custom status code", async () => {
    const app = new Hono();
    app.onError(errorHandler);

    app.get("/test", () => {
      throw new HttpError("Service unavailable", 503);
    });

    const res = await app.request("/test");
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ error: "Service unavailable" });
  });

  it("should handle generic Error with 500 status", async () => {
    const app = new Hono();
    app.onError(errorHandler);

    app.get("/test", () => {
      throw new Error("Something went wrong");
    });

    const res = await app.request("/test");
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Something went wrong" });
  });

  it("should handle Error without message with default message", async () => {
    const app = new Hono();
    app.onError(errorHandler);

    app.get("/test", () => {
      const error = new Error();
      error.message = "";
      throw error;
    });

    const res = await app.request("/test");
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Internal server error" });
  });

  it("should work with async route handlers", async () => {
    const app = new Hono();
    app.onError(errorHandler);

    app.get("/test", async () => {
      await Promise.resolve();
      throw new NotFoundError("Async error");
    });

    const res = await app.request("/test");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Async error" });
  });

  it("should handle errors thrown in middleware chain", async () => {
    const app = new Hono();
    app.onError(errorHandler);

    app.use("/test", async (c, next) => {
      throw new UnauthorizedError("Middleware error");
    });

    app.get("/test", () => {
      return new Response("Should not reach here");
    });

    const res = await app.request("/test");
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Middleware error" });
  });
});
