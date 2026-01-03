import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createAuth } from "../../auth";
import type { HonoEnv } from "../routes/app";
import type { AuthenticatedUser } from "./auth";

/**
 * Get authenticated user from session
 */
export async function getAuthenticatedUser(c: Context<HonoEnv>): Promise<AuthenticatedUser | null> {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return null;
  }

  const user = session.user as AuthenticatedUser;
  return user;
}

/**
 * Type guard to validate user has a valid tenantId
 * Returns true if user exists and has tenantId > 0
 */
export function hasValidTenant(user: unknown): user is AuthenticatedUser {
  return typeof user === 'object' && user !== null && 'tenantId' in user && typeof user.tenantId === 'number' && user.tenantId > 0;
}

/**
 * Middleware to require authentication
 * Returns 401 if user is not authenticated
 */
export const requireAuth = createMiddleware<HonoEnv>(async (c, next) => {
  const user = await getAuthenticatedUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized - Authentication required" }, 401);
  }

  if (!hasValidTenant(user)) {
    return c.json({ error: "Unauthorized - Invalid tenant" }, 401);
  }

  // Store user in context for later use
  c.set('user', user);
  await next();
});