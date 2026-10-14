import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../src/db";
import { loginAttempts, memberships, organizations, users } from "../src/db/schema";
import { hashPassword } from "../src/server/auth/password";

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@geekprice.com.br").trim().toLowerCase();
  const rawPassword = process.env.NEW_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

  let password = rawPassword?.trim();
  let generatedLocally = false;

  if (!password) {
    password = randomBytes(18).toString("base64url");
    generatedLocally = true;
    await writeFile(
      ".admin-rotated-password.local",
      `ADMIN_EMAIL=${adminEmail}\nADMIN_PASSWORD=${password}\nROTATED_AT=${new Date().toISOString()}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      }
    );
  } else if (password.length < 12) {
    throw new Error("A nova senha deve possuir no mínimo 12 caracteres.");
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  console.log("==> Iniciando rotação segura de credenciais administrativas...");

  await db.transaction(async (tx) => {
    // 1. Localizar conta administrativa principal
    const [adminUser] = await tx
      .select({ id: users.id, sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    if (!adminUser) {
      throw new Error(`Conta de administrador '${adminEmail}' não foi encontrada na base de dados.`);
    }

    // 2. Atualizar hash da senha e incrementar sessionVersion para invalidar todas as sessões ativas
    await tx
      .update(users)
      .set({
        passwordHash,
        active: true,
        emailVerifiedAt: now,
        sessionVersion: sql`coalesce(${users.sessionVersion}, 0) + 1`,
        updatedAt: now,
      })
      .where(eq(users.id, adminUser.id));

    // 3. Garantir que a organização principal existe e o papel é owner
    const [org] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.name, "GeekPrice Admin"))
      .limit(1);

    if (org) {
      const [membership] = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, adminUser.id), eq(memberships.organizationId, org.id)))
        .limit(1);

      if (!membership) {
        await tx.insert(memberships).values({
          organizationId: org.id,
          userId: adminUser.id,
          role: "owner",
        });
      } else if (membership.role !== "owner") {
        await tx
          .update(memberships)
          .set({ role: "owner" })
          .where(and(eq(memberships.userId, adminUser.id), eq(memberships.organizationId, org.id)));
      }
    }

    // 4. Desativar explicitamente qualquer conta de teste residual (ex: admin@teste.com)
    // Isso garante que apenas a conta solicitada pelo usuário seja mantida como admin.
    const [testUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@teste.com"))
      .limit(1);

    if (testUser) {
      await tx
        .update(users)
        .set({
          active: false,
          sessionVersion: sql`coalesce(${users.sessionVersion}, 0) + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, testUser.id));
    }

    // 5. Limpar tentativas de login acumuladas para evitar bloqueio acidental
    await tx
      .delete(loginAttempts)
      .where(or(eq(loginAttempts.email, adminEmail), eq(loginAttempts.email, "admin@teste.com")));
  });

  console.log("\n=======================================================");
  console.log("ROTAÇÃO DE CREDENCIAIS CONCLUÍDA COM SUCESSO");
  console.log(`[OK] Conta atualizada:                  ${adminEmail}`);
  console.log("[OK] Sessões anteriores invalidadas:    Sim (sessionVersion incrementada)");
  console.log("[OK] Conta de teste secundária:         Desativada");
  console.log("[OK] Histórico de bloqueios:            Limpo");
  if (generatedLocally) {
    console.log("[OK] Nova senha registrada em:          .admin-rotated-password.local (arquivo local seguro)");
  } else {
    console.log("[OK] Origem da nova senha:              Variável de ambiente (nenhuma credencial impressa)");
  }
  console.log("=======================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha na rotação de senha:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
