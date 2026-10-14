import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { loginAttempts, users } from "../src/db/schema";
import { hashPassword } from "../src/server/auth/password";

function rawEnvValue(content: string, name: string) {
  const prefix = `${name}=`;
  const line = content.split(/\r?\n/).find((entry) => entry.startsWith(prefix));
  if (!line) throw new Error(`${name} não foi encontrada no .env.`);
  const raw = line.slice(prefix.length);
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
  return raw;
}

async function main() {
  const content = await readFile(".env", "utf8");
  const email = rawEnvValue(content, "SEED_ADMIN_EMAIL").trim().toLowerCase();
  const password = rawEnvValue(content, "SEED_ADMIN_PASSWORD");
  if (password.length < 12) throw new Error("A senha completa precisa ter pelo menos 12 caracteres.");
  const [updated] = await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.email, email)).returning({ id: users.id });
  if (!updated) throw new Error("Administrador local não encontrado.");
  await db.delete(loginAttempts).where(eq(loginAttempts.email, email));
  console.log("Senha completa do administrador restaurada e tentativas locais limpas.");
}

main().then(() => process.exit(0)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
