import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../routes/app";
import { hasValidTenant } from "./auth.middleware";

export const MANAGE_RESOURCE = "manage";

export type ManageAction = "read" | "write";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requiredManageAction(method: string): ManageAction {
  return READ_METHODS.has(method.toUpperCase()) ? "read" : "write";
}

export const requireManagePermission = createMiddleware<HonoEnv>(async (c, next) => {
  if (!hasValidTenant(c.get("user"))) {
    return c.json({ error: "Unauthorized - Invalid tenant" }, 401);
  }

  const action = requiredManageAction(c.req.method);
  const permissions = c.get("apiKeyPermissions");

  if (!permissions?.[MANAGE_RESOURCE]?.includes(action)) {
    return c.json({ error: `This API key does not have the ${MANAGE_RESOURCE}:${action} permission` }, 403);
  }

  await next();
});
