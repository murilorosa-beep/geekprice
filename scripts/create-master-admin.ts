import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { memberships, organizations, pricingPolicies, softwareProducts, subscriptions, users } from "../src/db/schema";
import { hashPassword } from "../src/server/auth/password";

async function main() {
  const adminEmail = "admin@geekprice.com.br";
  const testEmail = "admin@teste.com";
  const password = "GeekPriceMaster2026!";
  const passwordHash = await hashPassword(password);
  const now = new Date();

  console.log("==> Configurando usuário Master Admin no PostgreSQL...");

  // 1. Obter ou criar organização principal
  let [org] = await db.select().from(organizations).where(eq(organizations.name, "GeekPrice Admin")).limit(1);
  if (!org) {
    [org] = await db.insert(organizations).values({
      name: "GeekPrice Admin",
      slug: `geekprice-admin-${Date.now()}`,
      onboardingCompletedAt: now,
    }).returning();
    console.log("Organização 'GeekPrice Admin' criada:", org.id);
  } else {
    console.log("Organização 'GeekPrice Admin' encontrada:", org.id);
  }

  // 2. Garantir produto de software GeekPrice
  let [softwareProduct] = await db.select().from(softwareProducts).where(eq(softwareProducts.code, "geekprice")).limit(1);
  if (!softwareProduct) {
    [softwareProduct] = await db.insert(softwareProducts).values({
      code: "geekprice",
      slug: "geekprice",
      name: "GeekPrice",
      description: "Plataforma SaaS de inteligência de preços e gestão de estoque para lojas geek e TCG.",
      active: true,
    }).returning();
    console.log("Produto de software GeekPrice criado:", softwareProduct.id);
  }

  // 3. Garantir política de preços
  const [existingPolicy] = await db.select().from(pricingPolicies).where(eq(pricingPolicies.organizationId, org.id)).limit(1);
  if (!existingPolicy) {
    await db.insert(pricingPolicies).values({
      organizationId: org.id,
      name: "Política padrão",
      feePercent: "12.00",
      additionalCostPercent: "0.00",
      minimumMarginPercent: "15.00",
      desiredMarginPercent: "25.00",
      marketDiscountPercent: "2.00",
    });
    console.log("Política de preços padrão vinculada.");
  }

  // 4. Garantir assinatura
  const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, org.id)).limit(1);
  if (!existingSub) {
    await db.insert(subscriptions).values({
      organizationId: org.id,
      softwareProductId: softwareProduct.id,
      plan: "starter",
      status: "active",
      productLimit: 5000,
      memberLimit: 10,
    });
    console.log("Assinatura ativa configurada.");
  }

  // 5. Configurar admin@geekprice.com.br
  let [userMaster] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (userMaster) {
    await db.update(users).set({
      name: "Murilo Rosa (Admin Master)",
      passwordHash,
      active: true,
      emailVerifiedAt: now,
      updatedAt: now,
    }).where(eq(users.id, userMaster.id));
    console.log(`Usuário ${adminEmail} atualizado com nova senha.`);
  } else {
    [userMaster] = await db.insert(users).values({
      name: "Murilo Rosa (Admin Master)",
      email: adminEmail,
      passwordHash,
      active: true,
      emailVerifiedAt: now,
    }).returning();
    console.log(`Usuário ${adminEmail} criado.`);
  }

  // Garantir membership como owner para admin@geekprice.com.br
  const [memMaster] = await db.select().from(memberships).where(eq(memberships.userId, userMaster.id)).limit(1);
  if (!memMaster) {
    await db.insert(memberships).values({
      organizationId: org.id,
      userId: userMaster.id,
      role: "owner",
    });
  } else if (memMaster.role !== "owner") {
    await db.update(memberships).set({ role: "owner" }).where(eq(memberships.userId, userMaster.id));
  }

  // 6. Atualizar também admin@teste.com com a mesma senha (caso prefira usar esse e-mail)
  const [userTest] = await db.select().from(users).where(eq(users.email, testEmail)).limit(1);
  if (userTest) {
    await db.update(users).set({
      passwordHash,
      active: true,
      emailVerifiedAt: now,
      updatedAt: now,
    }).where(eq(users.id, userTest.id));
    console.log(`Usuário alternativo ${testEmail} também sincronizado com a mesma senha.`);
  }

  console.log("\n=======================================================");
  console.log("USUÁRIO MASTER CADASTRADO COM SUCESSO:");
  console.log("E-mail principal:   admin@geekprice.com.br");
  console.log("E-mail alternativo: admin@teste.com");
  console.log("Senha de acesso:    GeekPriceMaster2026!");
  console.log("Permissão (Role):   owner (Acesso Total)");
  console.log("Organização:       GeekPrice Admin");
  console.log("=======================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha ao criar usuário master:", err);
    process.exit(1);
  });
