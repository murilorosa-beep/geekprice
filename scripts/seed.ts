import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { memberships, organizations, pricingPolicies, softwareProducts, subscriptions, users } from "../src/db/schema";
import { hashPassword } from "../src/server/auth/password";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error("Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mínimo 12 caracteres) apenas no .env local.");

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    console.log("Seed já aplicado para este e-mail.");
    return;
  }

  await db.transaction(async (tx) => {
    const now = new Date();
    const [softwareProduct] = await tx.select({ id: softwareProducts.id })
      .from(softwareProducts).where(eq(softwareProducts.code, "geekprice")).limit(1);
    if (!softwareProduct) throw new Error("Aplique as migrations para criar o produto GeekPrice.");
    const [organization] = await tx.insert(organizations).values({ name: "GeekPrice Admin", slug: `geekprice-admin-${Date.now()}`, onboardingCompletedAt: now }).returning();
    const [user] = await tx.insert(users).values({ name: "Administrador", email, passwordHash: await hashPassword(password), emailVerifiedAt: now }).returning();
    await tx.insert(memberships).values({ organizationId: organization.id, userId: user.id, role: "owner" });
    await tx.insert(pricingPolicies).values({ organizationId: organization.id, name: "Política padrão" });
    await tx.insert(subscriptions).values({ organizationId: organization.id, softwareProductId: softwareProduct.id, plan: "starter", status: "trialing", productLimit: 500 });
  });
  console.log("Organização e administrador criados com sucesso.");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
