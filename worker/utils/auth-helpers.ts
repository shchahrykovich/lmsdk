import {createAuthMiddleware} from "better-auth/api";
import type {DrizzleD1Database} from "drizzle-orm/d1";
import {UserService} from "../services/user.service";
import {TenantService} from "../services/tenant.service";

export function createPostSignUpHook(database: DrizzleD1Database, env: Cloudflare.Env) {
    return createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith("/sign-up")) {
            const newSession = ctx.context.newSession;
            if (newSession) {
                if (env.ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT === "true") {
                    const userService = new UserService(database);
                    await userService.assignTenantToUser(newSession.user.id);
                } else {
                    const tenantService = new TenantService(database);
                    const tenantCount = await tenantService.getCountOfTenants();
                    if (tenantCount === 0) {
                        const userService = new UserService(database);
                        await userService.assignTenantToUser(newSession.user.id);
                    }
                }
            }
        }
    });
}