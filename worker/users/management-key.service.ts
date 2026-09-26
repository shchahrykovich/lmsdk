import type { Auth } from "better-auth";
import { MANAGE_RESOURCE } from "../middleware/require-permission.middleware";

export type ManagementKeyAccess = "read" | "write";

export const DEFAULT_MANAGEMENT_KEY_EXPIRY_DAYS = 90;

const SECONDS_PER_DAY = 86_400;

export interface CreateManagementKeyInput {
  name: string;
  access: ManagementKeyAccess;
  expiresInDays?: number;
}

export interface CreatedManagementKey {
  id: string;
  name: string;
  key: string;
  permissions: Record<string, string[]>;
  expiresAt: Date | null;
}

interface BetterAuthApiKey {
  id: string;
  name: string;
  key: string;
  expiresAt?: Date | null;
}

export class ManagementKeyService {
  private readonly auth: Auth;

  constructor(auth: Auth) {
    this.auth = auth;
  }

  static permissionsFor(access: ManagementKeyAccess): Record<string, string[]> {
    return { [MANAGE_RESOURCE]: access === "write" ? ["read", "write"] : ["read"] };
  }

  async createKey(userId: string, input: CreateManagementKeyInput): Promise<CreatedManagementKey> {
    const permissions = ManagementKeyService.permissionsFor(input.access);
    const expiresInDays = input.expiresInDays ?? DEFAULT_MANAGEMENT_KEY_EXPIRY_DAYS;

    const api = this.auth.api as unknown as { createApiKey: (input: unknown) => Promise<BetterAuthApiKey> };
    const created = await api.createApiKey({
      body: {
        userId,
        name: input.name,
        permissions,
        expiresIn: expiresInDays * SECONDS_PER_DAY,
      },
    });

    return {
      id: created.id,
      name: created.name,
      key: created.key,
      permissions,
      expiresAt: created.expiresAt ?? null,
    };
  }
}
