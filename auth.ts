import {betterAuth} from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {apiKey} from "better-auth/plugins";
import {drizzle, DrizzleD1Database} from 'drizzle-orm/d1';
import * as schema from './worker/db/schema'
import {createPostSignUpHook} from "./worker/utils/auth-helpers";
import {hashPassword, verifyPassword} from "./worker/utils/security-helpers";

export function createAuth(env: Cloudflare.Env) {
    const database: DrizzleD1Database = drizzle(env.DB, {schema}) as unknown as DrizzleD1Database;

    return betterAuth({
        database: drizzleAdapter(database, {
            provider: 'sqlite',
        }),
        emailAndPassword: {
            enabled: true,
            password: {
                hash: hashPassword,
                verify: verifyPassword,
            },
            disableSignUp: env.BETTER_AUTH_DISABLED_SIGN_UP === "true",
        },
        basePath: "/api/auth",
        secret: env.BETTER_AUTH_SECRET,
        user: {
            additionalFields: {
                tenantId: {
                    type: "number",
                    required: false,
                    input: false,
                    defaultValue: -1,
                }
            }
        },
        plugins: [
            apiKey({
                rateLimit: {
                    enabled: false,
                }
            })
        ],
        hooks: {
            after: createPostSignUpHook(database, env),
        }
    });
}
