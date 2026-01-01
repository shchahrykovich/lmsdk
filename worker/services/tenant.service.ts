import { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { tenants, type Tenant } from "../db/schema";

export class TenantService {
  private db: DrizzleD1Database;

  constructor(db: DrizzleD1Database) {
    this.db = db;
  }

  async createTenant(): Promise<Tenant> {
    const [tenant] = await this.db
      .insert(tenants)
      .values({
        isActive: true,
      })
      .returning();

    return tenant;
  }

  async getTenantById(id: number): Promise<Tenant | undefined> {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);

    return tenant;
  }

  async getCountOfTenants(): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tenants);

    return result?.count ?? 0;
  }

  async deactivateTenant(id: number) {
    return await this.db
      .update(tenants)
      .set({ isActive: false })
      .where(eq(tenants.id, id));
  }

  async removeTenant(tenantId: number) {
    return await this.db
        .delete(tenants)
        .where(eq(tenants.id, tenantId));
  }
}
