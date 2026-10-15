import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  loginAttempts,
  memberships,
  organizations,
  pricingPolicies,
  softwareProducts,
  subscriptions,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/server/auth/password";

async function main() {
  const adminEmail = "murilo@geekprice.com.br";
  const rawPassword = process.env.ADMIN_PASSWORD;

  // Gerar senha forte criptográfica de 16 caracteres segura e sem ambiguidades
  const password = rawPassword?.trim() || randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(password);
  const now = new Date();

  console.log(`==> Provisionando conta de administrador para '${adminEmail}'...`);

  await db.transaction(async (tx) => {
    // 1. Obter ou criar organização GeekPrice Admin
    let [org] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.name, "GeekPrice Admin"))
      .limit(1);

    if (!org) {
      [org] = await tx
        .insert(organizations)
        .values({
          name: "GeekPrice Admin",
          slug: `geekprice-admin-${Date.now()}`,
          onboardingCompletedAt: now,
        })
        .returning();
      console.log("[OK] Organização 'GeekPrice Admin' criada.");
    }

    // 2. Garantir produto de software GeekPrice
    let [softwareProduct] = await tx
      .select()
      .from(softwareProducts)
      .where(eq(softwareProducts.code, "geekprice"))
      .limit(1);

    if (!softwareProduct) {
      [softwareProduct] = await tx
        .insert(softwareProducts)
        .values({
          code: "geekprice",
          slug: "geekprice",
          name: "GeekPrice",
          description: "Plataforma SaaS de inteligência de preços e gestão de estoque para lojas geek e TCG.",
          active: true,
        })
        .returning();
      console.log("[OK] Produto de software GeekPrice registrado.");
    }

    // 3. Garantir política padrão
    const [existingPolicy] = await tx
      .select()
      .from(pricingPolicies)
      .where(eq(pricingPolicies.organizationId, org.id))
      .limit(1);

    if (!existingPolicy) {
      await tx.insert(pricingPolicies).values({
        organizationId: org.id,
        name: "Política padrão",
        feePercent: "12.00",
        additionalCostPercent: "0.00",
        minimumMarginPercent: "15.00",
        desiredMarginPercent: "25.00",
        marketDiscountPercent: "2.00",
      });
      console.log("[OK] Política de preços padrão vinculada.");
    }

    // 4. Garantir assinatura ativa
    const [existingSub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id))
      .limit(1);

    if (!existingSub) {
      await tx.insert(subscriptions).values({
        organizationId: org.id,
        softwareProductId: softwareProduct.id,
        plan: "starter",
        status: "active",
        productLimit: 5000,
        memberLimit: 10,
      });
      console.log("[OK] Assinatura ativa configurada.");
    }

    // 5. Inserir ou atualizar usuário murilo@geekprice.com.br
    let [adminUser] = await tx
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    if (adminUser) {
      await tx
        .update(users)
        .set({
          name: "Murilo (Admin)",
          passwordHash,
          active: true,
          emailVerifiedAt: now,
          sessionVersion: sql`coalesce(${users.sessionVersion}, 0) + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, adminUser.id));
      console.log(`[OK] Usuário existente '${adminEmail}' atualizado com nova senha.`);
    } else {
      [adminUser] = await tx
        .insert(users)
        .values({
          name: "Murilo (Admin)",
          email: adminEmail,
          passwordHash,
          active: true,
          emailVerifiedAt: now,
        })
        .returning();
      console.log(`[OK] Usuário '${adminEmail}' criado.`);
    }

    // 6. Garantir permissão owner na organização GeekPrice Admin
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
      console.log("[OK] Permissão 'owner' vinculada ao usuário.");
    } else if (membership.role !== "owner") {
      await tx
        .update(memberships)
        .set({ role: "owner" })
        .where(and(eq(memberships.userId, adminUser.id), eq(memberships.organizationId, org.id)));
      console.log("[OK] Permissão promovida para 'owner'.");
    }

    // 7. Limpar quaisquer bloqueios prévios de rate-limit
    await tx
      .delete(loginAttempts)
      .where(sql`${loginAttempts.email} in ('murilo', ${adminEmail})`);
    console.log("[OK] Histórico de bloqueios limpo.");
  });

  // Salvar credenciais no arquivo local seguro (ignorado no git)
  await writeFile(
    ".admin-credentials-murilo.local",
    `USER=murilo\nEMAIL=${adminEmail}\nPASSWORD=${password}\nCREATED_AT=${now.toISOString()}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  console.log("\n=======================================================");
  console.log("CONTA DE ADMIN CRIADA COM SUCESSO!");
  console.log(`Usuário de login:  murilo  (ou ${adminEmail})`);
  console.log(`E-mail:            ${adminEmail}`);
  console.log(`Senha:             ${password}`);
  console.log("Papel (Role):      owner (Acesso Total / GeekPrice Admin)");
  console.log("Credenciais salvas em: .admin-credentials-murilo.local");
  console.log("=======================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha ao provisionar usuário admin:", err);
    process.exit(1);
  });
