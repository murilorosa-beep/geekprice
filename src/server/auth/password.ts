import { hash, needsRehash, verify, argon2id } from "argon2";
import { compare } from "bcryptjs";

const argonOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string) {
  return hash(password, argonOptions);
}

export async function verifyPassword(passwordHash: string, password: string) {
  if (passwordHash.startsWith("$argon2")) {
    const valid = await verify(passwordHash, password);
    return { valid, needsUpgrade: valid && needsRehash(passwordHash, argonOptions) };
  }

  if (passwordHash.startsWith("$2")) {
    const valid = await compare(password, passwordHash);
    return { valid, needsUpgrade: valid };
  }

  return { valid: false, needsUpgrade: false };
}
