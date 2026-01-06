import {DrizzleD1Database} from "drizzle-orm/d1";
import {eq} from "drizzle-orm";
import {user} from "../db/schema";
import {TenantService} from "./tenant.service";
import type {createAuth} from "../../auth";

interface CreateUserInput {
    name: string;
    email: string;
    password: string;
    tenantId: number;
}

interface UserSummary {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    tenantId: number;
    createdAt: Date;
    updatedAt: Date;
}

export class UserService {
    private db: DrizzleD1Database;
    private tenantService: TenantService;

    constructor(db: DrizzleD1Database) {
        this.db = db;
        this.tenantService = new TenantService(db);
    }

    async assignTenantToUser(userId: string): Promise<{userId: string; tenantId: number}> {
        // Create a new tenant
        const tenant = await this.tenantService.createTenant();

        // Update the user with the tenant ID
        await this.db
            .update(user)
            .set({tenantId: tenant.id})
            .where(eq(user.id, userId));

        return {userId, tenantId: tenant.id};
    }

    async getUsersByTenantId(tenantId: number): Promise<UserSummary[]> {
        const users = await this.db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified,
                image: user.image,
                tenantId: user.tenantId,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            })
            .from(user)
            .where(eq(user.tenantId, tenantId));

        return users;
    }

    async createUser(
        auth: ReturnType<typeof createAuth>,
        input: CreateUserInput
    ): Promise<UserSummary | undefined> {
        // Create user using better-auth API
        const signUpResult = await auth.api.signUpEmail({
            body: {
                name: input.name,
                email: input.email,
                password: input.password,
            },
        });

        if (!signUpResult?.user) {
            throw new Error("Failed to create user");
        }

        // Update the user's tenantId to match the admin's tenant
        await this.db
            .update(user)
            .set({tenantId: input.tenantId})
            .where(eq(user.id, signUpResult.user.id));

        // Remove the old one
        await this.tenantService.removeTenant(input.tenantId);

        // Fetch and return the updated user
        const [createdUser] = await this.db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified,
                image: user.image,
                tenantId: user.tenantId,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            })
            .from(user)
            .where(eq(user.id, signUpResult.user.id))
            .limit(1);

        return createdUser;
    }
}
