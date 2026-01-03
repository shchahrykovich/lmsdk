import type { Context } from "hono";
import type { HonoEnv } from "../routes/app";

export interface AuthenticatedUser {
    id: string;
    name: string;
    email: string;
    tenantId: number;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
}


export function getUserFromContext(c: Context<HonoEnv>): AuthenticatedUser {
    return c.get("user")!;
}
