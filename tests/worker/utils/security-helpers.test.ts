import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../../worker/utils/security-helpers";

describe("Security helpers", () => {
  describe("password hashing", () => {
    it("should verify a known hash", async () => {
      const password = "real-password";
      const hash =
        "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff:e1ca330d4dc8bf34ba2cce4c921d606356853d3c7fe15796b665a15ee946d4e34ae0ad095b6f7806d5256aa68f000699599995835b2d8011d92131443175e093";

      await expect(verifyPassword({ hash, password })).resolves.toBe(true);
    });

    it("should hash and verify valid passwords", async () => {
      const password = "test-password";
      const hash = await hashPassword(password);

      expect(hash).toContain(":");
      const [salt, digest] = hash.split(":");
      expect(salt).toHaveLength(64);
      expect(digest).toHaveLength(128);

      await expect(verifyPassword({ hash, password })).resolves.toBe(true);
    });

    it("should reject invalid passwords", async () => {
      const password = "test-password";
      const hash = await hashPassword(password);

      await expect(
        verifyPassword({ hash, password: "wrong-password" })
      ).resolves.toBe(false);
    });

    it("should reject malformed hashes", async () => {
      await expect(
        verifyPassword({ hash: "invalid-hash", password: "test-password" })
      ).resolves.toBe(false);

      await expect(
        verifyPassword({ hash: "00:00", password: "test-password" })
      ).resolves.toBe(false);
    });
  });
});
