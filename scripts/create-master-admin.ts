import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  memberships,
  organizations,
  pricingPolicies,
  softwareProducts,
  subscriptions,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/server/auth/password";
import { ensureMasterAdminOrganizationOwner } from "../src/server/admin/master-admin-membership";

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@geekprice.com.br").trim().toLowerCase();
  const adminName = (process.env.ADMIN_NAME || "Administrador GeekPrice").trim();
  if (!adminName) throw new Error("ADMIN_NAME não pode ser vazio.");
  const rawPassword = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
  if (process.env.RAILWAY_ENVIRONMENT_ID && !rawPassword) {
    throw new Error("Defina ADMIN_PASSWORD no Railway antes de provisionar o administrador.");
  }

  let password = rawPassword?.trim();
  let generatedLocally = false;

  if (!password) {
    // Gerar senha forte criptográfica com alta entropia (24 caracteres base64url)
    password = randomBytes(18).toString("base64url");
    generatedLocally = true;
    await writeFile(
      ".admin-credentials.local",
      `ADMIN_EMAIL=${adminEmail}\nADMIN_PASSWORD=${password}\nGENERATED_AT=${new Date().toISOString()}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      }
    );
  } else if (password.length < 12) {
    throw new Error("A senha do administrador deve ter no mínimo 12 caracteres.");
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  console.log("==> Provisionando usuário Master Admin com segurança...");

  await db.transaction(async (tx) => {
    // 1. Obter ou criar organização principal
    let [org] = await tx.select().from(organizations).where(eq(organizations.name, "GeekPrice Admin")).limit(1);
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
    let [softwareProduct] = await tx.select().from(softwareProducts).where(eq(softwareProducts.code, "geekprice")).limit(1);
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

    // 3. Garantir política de preços padrão
    const [existingPolicy] = await tx.select().from(pricingPolicies).where(eq(pricingPolicies.organizationId, org.id)).limit(1);
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
    const [existingSub] = await tx.select().from(subscriptions).where(eq(subscriptions.organizationId, org.id)).limit(1);
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

    // 5. Configurar usuário admin master único
    let [userMaster] = await tx.select().from(users).where(eq(users.email, adminEmail)).limit(1);
    if (userMaster) {
      await tx
        .update(users)
        .set({
          name: adminName,
          passwordHash,
          active: true,
          emailVerifiedAt: now,
          sessionVersion: sql`coalesce(${users.sessionVersion}, 0) + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, userMaster.id));
      console.log(`[OK] Usuário ${adminEmail} atualizado e sessões anteriores invalidadas.`);
    } else {
      [userMaster] = await tx
        .insert(users)
        .values({
          name: adminName,
          email: adminEmail,
          passwordHash,
          active: true,
          emailVerifiedAt: now,
        })
        .returning();
      console.log(`[OK] Usuário ${adminEmail} provisionado.`);
    }

    // 6. Garantir owner exclusivamente na organização administrativa.
    // Memberships do mesmo usuário em lojas de clientes nunca são alterados.
    await ensureMasterAdminOrganizationOwner({
      async findByUserAndOrganization(userId, organizationId) {
        const [membership] = await tx.select({ role: memberships.role }).from(memberships).where(and(
          eq(memberships.userId, userId),
          eq(memberships.organizationId, organizationId),
        )).limit(1);
        return membership;
      },
      async createOwner(userId, organizationId) {
        await tx.insert(memberships).values({ organizationId, userId, role: "owner" });
      },
      async promoteToOwner(userId, organizationId) {
        await tx.update(memberships).set({ role: "owner" }).where(and(
          eq(memberships.userId, userId),
          eq(memberships.organizationId, organizationId),
        ));
      },
    }, userMaster.id, org.id);

    // 7. Desativar qualquer conta de teste residual (garantir conta única de admin conforme solicitado)
    const [testUser] = await tx.select().from(users).where(eq(users.email, "admin@teste.com")).limit(1);
    if (testUser) {
      await tx
        .update(users)
        .set({
          active: false,
          sessionVersion: sql`coalesce(${users.sessionVersion}, 0) + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, testUser.id));
      console.log("[OK] Conta de teste secundária desativada (único admin mantido: " + adminEmail + ").");
    }
  });

  console.log("\n=======================================================");
  console.log("PROVISIONAMENTO SEGURO CONCLUÍDO COM SUCESSO");
  console.log(`E-mail do administrador: ${adminEmail}`);
  console.log("Permissão (Role):       owner (Acesso Total)");
  console.log("Organização:            GeekPrice Admin");
  if (generatedLocally) {
    console.log("Credenciais salvas em:  .admin-credentials.local (protegido e ignorado pelo Git)");
  } else {
    console.log("Origem da senha:        Lida de variável de ambiente (não impressa em log)");
  }
  console.log("=======================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha ao provisionar usuário master:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
