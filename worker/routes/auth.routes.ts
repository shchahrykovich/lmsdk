import {Hono} from "hono";
import type {HonoEnv} from "./app";
import {TenantService} from "../services/tenant.service";
import {drizzle, DrizzleD1Database} from "drizzle-orm/d1";
import * as schema from "../db/schema";

const auth = new Hono<HonoEnv>();

// Handle all better-auth endpoints
auth.all("/*", async (c) => {
	const auth = c.get("auth");

	if (c.req.path.toLowerCase().startsWith("/api/auth/sign-up")) {
		if (c.env.ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT !== "true") {
			const database: DrizzleD1Database = drizzle(c.env.DB, {schema}) as unknown as DrizzleD1Database;
			const tenantService = new TenantService(database);
			const tenantCount = await tenantService.getCountOfTenants();
			if (0 < tenantCount) {
				return c.json({ error: "can_not_create_tenant" }, 400);
			}
		}
	}

	return auth.handler(c.req.raw);
});


export default auth;
