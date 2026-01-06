import {createAuthMiddleware} from "better-auth/api";
import type {DrizzleD1Database} from "drizzle-orm/d1";
import {UserService} from "../services/user.service";
import {TenantService} from "../services/tenant.service";

export function createPostSignUpHook(
    database: DrizzleD1Database,
    env: Cloudflare.Env
): ReturnType<typeof createAuthMiddleware> {
    return createAuthMiddleware(async (ctx) => {
        if (!ctx.path.toLowerCase().startsWith("/sign-up")) {
            return;
        }

        const newSession = ctx.context.newSession;
        if (!newSession) {
            return;
        }

        const userService = new UserService(database);
        if (env.ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT === "true") {
            await userService.assignTenantToUser(newSession.user.id);
            return;
        }

        const tenantService = new TenantService(database);
        const tenantCount = await tenantService.getCountOfTenants();
        if (tenantCount === 0) {
            await userService.assignTenantToUser(newSession.user.id);
        }
    });
}
