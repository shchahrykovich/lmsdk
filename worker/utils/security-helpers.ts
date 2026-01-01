import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SALT_LENGTH = 32;

export async function hashPassword(password: string): Promise<string> {
  const saltBuffer = randomBytes(SALT_LENGTH);
  const salt = saltBuffer.toString("hex");
  const hash = scryptSync(password, saltBuffer, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  // Validate hash format to prevent crashes
  const parts = hash.split(":");
  if (parts.length !== 2) {
    return false;
  }

  const [saltHex, keyHex] = parts;

  // Decode hex strings to buffers
  const saltBuffer = Buffer.from(saltHex, "hex");
  const keyBuffer = Buffer.from(keyHex, "hex");

  // Validate expected lengths (hex string should be 2x the byte length)
  if (saltBuffer.length !== SALT_LENGTH || keyBuffer.length !== SCRYPT_KEYLEN) {
    return false;
  }

  // Compute hash with the actual salt bytes
  const hashBuffer = scryptSync(password, saltBuffer, SCRYPT_KEYLEN);

  // Use constant-time comparison
  return timingSafeEqual(hashBuffer, keyBuffer);
}