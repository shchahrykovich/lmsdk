import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { requireAuth } from "../middleware/auth.middleware";
import { getUserFromContext } from "../middleware/auth";
import { UserService } from "../services/user.service";
import type { HonoEnv } from "./app";

const users = new Hono<HonoEnv>();

users.use("/*", requireAuth);

// GET /api/users - Get all users for tenant
users.get("/", async (c) => {
  const user = getUserFromContext(c);
  const db = drizzle(c.env.DB);
  const userService = new UserService(db);

  const tenantUsers = await userService.getUsersByTenantId(user.tenantId);
  return c.json({ users: tenantUsers });
});

// POST /api/users - Create a new user in the current tenant
users.post("/", async (c) => {
  try {
    const user = getUserFromContext(c);
    const body = await c.req.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return c.json({ error: "Name, email, and password are required" }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const db = drizzle(c.env.DB);
    const userService = new UserService(db);
    const auth = c.get("auth");

    const newUser = await userService.createUser(auth, {
      name,
      email,
      password,
      tenantId: user.tenantId,
    });

    return c.json({ user: newUser }, 201);
  } catch (error) {
    console.error("Error creating user:", error);

    if (error instanceof Error) {
      if (error.message.includes("email")) {
        return c.json({ error: "Email already exists" }, 409);
      }
    }

    return c.json({ error: "Failed to create user" }, 500);
  }
});

export default users;
