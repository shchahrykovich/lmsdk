import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TenantService } from "../../../../worker/services/tenant.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Tenant } from "../../../../worker/db/schema";

describe("TenantService - Tenant lifecycle tests", () => {
  let tenantService: TenantService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    tenantService = new TenantService(db);
  });

  it("should support complete tenant lifecycle", async () => {
    // Create
    const tenant = await tenantService.createTenant();
    expect(tenant.isActive).toBe(true);

    // Verify in database
    let dbTenant = await env.DB.prepare(
      "SELECT * FROM Tenants WHERE id = ?"
    ).bind(tenant.id).first<Tenant>();
    expect(dbTenant?.isActive).toBe(1);

    // Read
    const retrieved = await tenantService.getTenantById(tenant.id);
    expect(retrieved?.id).toBe(tenant.id);
    expect(retrieved?.isActive).toBe(true);

    // Deactivate
    await tenantService.deactivateTenant(tenant.id);

    // Verify deactivation
    const deactivated = await tenantService.getTenantById(tenant.id);
    expect(deactivated?.isActive).toBe(false);

    // Verify in database
    dbTenant = await env.DB.prepare(
      "SELECT * FROM Tenants WHERE id = ?"
    ).bind(tenant.id).first<Tenant>();
    expect(dbTenant?.isActive).toBe(0);
  });

  it("should handle high-volume tenant creation", async () => {
    const tenantCount = 100;
    const tenants = [];

    // Create many tenants
    for (let i = 0; i < tenantCount; i++) {
      tenants.push(await tenantService.createTenant());
    }

    expect(tenants).toHaveLength(tenantCount);

    // Verify all have unique IDs
    const ids = tenants.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(tenantCount);

    // Verify all are active
    expect(tenants.every(t => t.isActive === true)).toBe(true);

    // Verify in database
    const countResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Tenants"
    ).first<{ count: number }>();
    expect(countResult?.count).toBe(tenantCount);

    const activeCountResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Tenants WHERE isActive = 1"
    ).first<{ count: number }>();
    expect(activeCountResult?.count).toBe(tenantCount);
  });

  it("should maintain data integrity across operations", async () => {
    // Create multiple tenants
    const tenant1 = await tenantService.createTenant();
    const tenant2 = await tenantService.createTenant();
    const tenant3 = await tenantService.createTenant();

    // Deactivate some
    await tenantService.deactivateTenant(tenant1.id);
    await tenantService.deactivateTenant(tenant3.id);

    // Verify individual states
    const t1 = await tenantService.getTenantById(tenant1.id);
    const t2 = await tenantService.getTenantById(tenant2.id);
    const t3 = await tenantService.getTenantById(tenant3.id);

    expect(t1?.isActive).toBe(false);
    expect(t2?.isActive).toBe(true);
    expect(t3?.isActive).toBe(false);

    // Verify database consistency
    const allTenants = await env.DB.prepare(
      "SELECT * FROM Tenants ORDER BY id"
    ).all<Tenant>();

    expect(allTenants.results).toHaveLength(3);
    expect(allTenants.results[0].isActive).toBe(0);
    expect(allTenants.results[1].isActive).toBe(1);
    expect(allTenants.results[2].isActive).toBe(0);

    // Verify no duplicate IDs
    const ids = allTenants.results.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });
});
