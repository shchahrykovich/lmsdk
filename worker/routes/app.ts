import {Hono} from "hono";
import {fromHono} from "chanfana";
import {createAuth} from "../../auth";
import projectsRouter from "./projects.routes";
import promptsRouter from "./prompts.routes";
import providersRouter from "./providers.routes";
import logsRouter from "./logs.routes";
import tracesRouter from "./traces.routes";
import usersRouter from "./users.routes";
import authRouter from "./auth.routes";
import type {AuthenticatedUser} from "../middleware/auth";
import {requireApiKey} from "../middleware/apikey.middleware";
import {V1Whoami} from "../openapi/v1/whoami";
import {V1ExecutePrompt} from "../openapi/v1/execute-prompt";
import {V1PromptVersions} from "../openapi/v1/prompt-versions";
import {V1PromptVersion} from "../openapi/v1/prompt-version";
import {V1PromptVersionLatest} from "../openapi/v1/prompt-version-latest";
import {V1PromptVersionActive} from "../openapi/v1/prompt-version-active";
import {getVersion} from "../utils/get-version";

export interface HonoEnv {
	Bindings: Env;
	Variables: {
		auth: ReturnType<typeof createAuth>;
		user?: AuthenticatedUser;
	};
}

export function createHonoApp() {

	const app = new Hono<HonoEnv>();

	app.use("*", async (c, next) => {
		const auth = createAuth(c.env);
		c.set("auth", auth);
		await next();
	});

	// Setup OpenAPI registry
	const openapi = fromHono(app, {
		docs_url: "/api/docs",
		openapi_url: "/api/openapi.json",
		schema: {
			info: {
				title: "LM SDK API",
				version: getVersion(),
				description: "API for managing and executing AI prompts with versioning, and distributed tracing.",
			},
		},
	});

	// Register security scheme
	openapi.registry.registerComponent("securitySchemes", "apiKey", {
		type: "apiKey",
		in: "header",
		name: "x-api-key",
	});

	// Apply API key middleware to all v1 routes
	app.use("/api/v1/*", requireApiKey);

	// Register OpenAPI v1 endpoints
	openapi.get("/api/v1/whoami", V1Whoami);
	openapi.post("/api/v1/projects/:projectSlugOrId/prompts/:promptSlugOrId/execute", V1ExecutePrompt);
	openapi.get("/api/v1/projects/:projectSlugOrId/prompts/:promptSlugOrId/versions", V1PromptVersions);
	openapi.get("/api/v1/projects/:projectSlugOrId/prompts/:promptSlugOrId/versions/latest", V1PromptVersionLatest);
	openapi.get("/api/v1/projects/:projectSlugOrId/prompts/:promptSlugOrId/versions/active", V1PromptVersionActive);
	openapi.get("/api/v1/projects/:projectSlugOrId/prompts/:promptSlugOrId/versions/:versionId", V1PromptVersion);

	// Mount regular routes (non-OpenAPI)
	app.route("/api/auth", authRouter);
	app.route("/api/projects", projectsRouter);
	app.route("/api/projects", promptsRouter);
	app.route("/api/projects", logsRouter);
	app.route("/api/projects", tracesRouter);
	app.route("/api/providers", providersRouter);
	app.route("/api/users", usersRouter);

	return app;
}
