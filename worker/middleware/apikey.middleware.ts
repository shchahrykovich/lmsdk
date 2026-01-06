import { createMiddleware } from "hono/factory";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { HonoEnv } from "../routes/app";
import type { AuthenticatedUser } from "./auth";
import { user } from "../db/schema";
import {type Auth} from "better-auth";

/**
 * Middleware to require API key authentication
 * Verifies the API key from x-api-key header
 * Fetches the full user from database and stores in context
 */
export const requireApiKey = createMiddleware<HonoEnv>(async (c, next) => {
  try {
    // Get API key from headers
    const apiKey = c.req.header("x-api-key");

    if (!apiKey) {
      return c.json({ error: "API key required" }, 401);
    }

    // Get auth instance from context
    const auth: Auth = c.get("auth");

    // Verify the API key
		// @ts-expect-error no type
    const verifyResult = await auth.api.verifyApiKey({
      body: {
        key: apiKey,
      },
    });

    if (!verifyResult.valid || !verifyResult.key) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    // Create Drizzle client
    const db = drizzle(c.env.DB);

    // Fetch full user from database
    const [userRecord] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        tenantId: user.tenantId,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, verifyResult.key.userId))
      .limit(1);

    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    // Store user in context (same as session-based auth)
    c.set("user", userRecord as AuthenticatedUser);
    await next();
  } catch (error) {
    console.error("Error in API key middleware:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
