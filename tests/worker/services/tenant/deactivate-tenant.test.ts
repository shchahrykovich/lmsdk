import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { TenantService } from "../../../../worker/services/tenant.service";
import { applyMigrations } from "../../helpers/db-setup";

describe("TenantService - deactivateTenant", () => {
  let tenantService: TenantService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    tenantService = new TenantService(db);
  });

  it("should deactivate an active tenant", async () => {
    const created = await tenantService.createTenant();

    expect(created.isActive).toBe(true);

    await tenantService.deactivateTenant(created.id);

    // Verify tenant is now inactive using service method
    const tenant = await tenantService.getTenantById(created.id);
    expect(tenant?.isActive).toBe(false);

    // Verify using direct SQL
    const dbTenant = await env.DB.prepare(
      "SELECT isActive FROM Tenants WHERE id = ?"
    ).bind(created.id).first<{ isActive: number }>();

    expect(dbTenant?.isActive).toBe(0); // SQLite stores false as 0
  });

  it("should be idempotent when deactivating already inactive tenant", async () => {
    const created = await tenantService.createTenant();

    // Deactivate once
    await tenantService.deactivateTenant(created.id);

    // Verify it's inactive
    let tenant = await tenantService.getTenantById(created.id);
    expect(tenant?.isActive).toBe(false);

    // Deactivate again (should not error)
    await tenantService.deactivateTenant(created.id);

    // Should still be inactive
    tenant = await tenantService.getTenantById(created.id);
    expect(tenant?.isActive).toBe(false);

    // Verify using direct SQL
    const dbTenant = await env.DB.prepare(
      "SELECT isActive FROM Tenants WHERE id = ?"
    ).bind(created.id).first<{ isActive: number }>();

    expect(dbTenant?.isActive).toBe(0);
  });

  it("should only deactivate the specified tenant", async () => {
    const tenant1 = await tenantService.createTenant();
    const tenant2 = await tenantService.createTenant();
    const tenant3 = await tenantService.createTenant();

    // Deactivate only tenant2
    await tenantService.deactivateTenant(tenant2.id);

    // Verify states using direct SQL
    const result1 = await env.DB.prepare(
      "SELECT isActive FROM Tenants WHERE id = ?"
    ).bind(tenant1.id).first<{ isActive: number }>();
    expect(result1?.isActive).toBe(1); // Still active

    const result2 = await env.DB.prepare(
      "SELECT isActive FROM Tenants WHERE id = ?"
    ).bind(tenant2.id).first<{ isActive: number }>();
    expect(result2?.isActive).toBe(0); // Deactivated

    const result3 = await env.DB.prepare(
      "SELECT isActive FROM Tenants WHERE id = ?"
    ).bind(tenant3.id).first<{ isActive: number }>();
    expect(result3?.isActive).toBe(1); // Still active

    // Verify counts
    const activeCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Tenants WHERE isActive = 1"
    ).first<{ count: number }>();
    expect(activeCount?.count).toBe(2);

    const inactiveCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Tenants WHERE isActive = 0"
    ).first<{ count: number }>();
    expect(inactiveCount?.count).toBe(1);
  });

  it("should handle deactivating non-existent tenant gracefully", async () => {
    // Should not throw error when tenant doesn't exist
    await expect(
      tenantService.deactivateTenant(99999)
    ).resolves.not.toThrow();

    // Verify no tenants were affected
    const allTenants = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Tenants WHERE isActive = 0"
    ).first<{ count: number }>();

    expect(allTenants?.count).toBe(0);
  });

  it("should preserve other tenant fields when deactivating", async () => {
    const created = await tenantService.createTenant();

    const originalCreatedAt = created.createdAt;
    const originalUpdatedAt = created.updatedAt;

    // Wait to ensure timestamp would change if it was being updated
    await new Promise(resolve => setTimeout(resolve, 100));

    await tenantService.deactivateTenant(created.id);

    // Get the tenant again
    const tenant = await tenantService.getTenantById(created.id);

    expect(tenant?.id).toBe(created.id);
    expect(tenant?.createdAt.getTime()).toBe(originalCreatedAt.getTime());

    // Note: updatedAt might change depending on database trigger behavior
    // Just verify it's still defined
    expect(tenant?.updatedAt).toBeDefined();
  });

  it("should handle deactivating multiple tenants sequentially", async () => {
    const tenants = [];
    for (let i = 0; i < 5; i++) {
      tenants.push(await tenantService.createTenant());
    }

    // Deactivate all tenants
    for (const tenant of tenants) {
      await tenantService.deactivateTenant(tenant.id);
    }

    // Verify all are inactive
    for (const tenant of tenants) {
      const retrieved = await tenantService.getTenantById(tenant.id);
      expect(retrieved?.isActive).toBe(false);
    }

    // Verify using direct SQL
    const activeCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Tenants WHERE isActive = 1"
    ).first<{ count: number }>();
    expect(activeCount?.count).toBe(0);

    const inactiveCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Tenants WHERE isActive = 0"
    ).first<{ count: number }>();
    expect(inactiveCount?.count).toBe(5);
  });
});
