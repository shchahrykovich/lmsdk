import {Hono} from "hono";
import {createAuth} from "../../auth";
import projectsRouter from "./projects.routes";
import promptsRouter from "./prompts.routes";
import v1Router from "./v1.routes";
import providersRouter from "./providers.routes";
import logsRouter from "./logs.routes";
import tracesRouter from "./traces.routes";
import usersRouter from "./users.routes";
import type {AuthenticatedUser} from "../middleware/auth";

export interface HonoEnv {
    Bindings: Env;
    Variables: {
        auth: ReturnType<typeof createAuth>;
        user?: AuthenticatedUser;
    };
}

export function createHonoApp() {

    const app = new Hono<HonoEnv>();

// Middleware to add auth instance to context
    app.use("*", async (c, next) => {
        const auth = createAuth(c.env);
        c.set("auth", auth);
        await next();
    });

// Handle all better-auth endpoints
    app.all("/api/auth/*", async (c) => {
        const auth = c.get("auth");
        return auth.handler(c.req.raw);
    });

// Mount routers
    app.route("/api/v1", v1Router);
    app.route("/api/projects", projectsRouter);
    app.route("/api/projects", promptsRouter);
    app.route("/api/projects", logsRouter);
    app.route("/api/projects", tracesRouter);
    app.route("/api/providers", providersRouter);
    app.route("/api/users", usersRouter);

// Catch-all for frontend routes (SPA)
    app.get("/*", (c) => {
        return c.text('Frontend route');
    });

    return app;
}