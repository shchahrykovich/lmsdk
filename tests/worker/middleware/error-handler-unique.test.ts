import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { errorHandler } from "../../../worker/middleware/error-handler.middleware";
import { projects } from "../../../worker/db/schema";
import { applyMigrations } from "../helpers/db-setup";

describe("errorHandler - D1 unique constraint", () => {
  beforeEach(async () => {
    await applyMigrations();
  });

  it("returns 409 when a real D1 insert breaks a unique index", async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.post("/test", async () => {
      const db = drizzle(env.DB);
      await db.insert(projects).values({ name: "A", slug: "a", tenantId: 1 });
      await db.insert(projects).values({ name: "A", slug: "a", tenantId: 1 });
      return new Response("unreachable");
    });

    const res = await app.request("/test", { method: "POST" });
    const body = await res.json<{ error: string }>();

    expect(res.status).toBe(409);
    expect(body.error).toBe("A record with the same unique value already exists");
  });

  it("still returns 500 for other database errors", async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get("/test", async () => {
      await env.DB.prepare("SELECT * FROM TableThatDoesNotExist").all();
      return new Response("unreachable");
    });

    const res = await app.request("/test");

    expect(res.status).toBe(500);
  });
});
