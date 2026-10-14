import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  authActionTokens,
  legalAcceptances,
  memberships,
  organizations,
  softwareProducts,
  subscriptions,
  users,
} from "@/db/schema";
import { hashPassword } from "./password";
import { buildAuthActionToken } from "./tokens";

function getIntegerSetting(name: string, fallback: number, minimum: number, maximum: number) {
  const configured = process.env[name];
  if (!configured) return fallback;
  const value = Number(configured);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} deve ser um número inteiro entre ${minimum} e ${maximum}.`);
  }
  return value;
}

function createOrganizationSlug(name: string) {
  const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const base = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 78) || "loja";
  return `${base}-${randomBytes(5).toString("hex")}`;
}

export async function registerOrganization(input: {
  name: string;
  email: string;
  password: string;
  storeName: string;
  termsVersion: string;
  privacyVersion: string;
}) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const trialDays = getIntegerSetting("BILLING_TRIAL_DAYS", 14, 0, 90);
  const productLimit = getIntegerSetting("BILLING_TRIAL_PRODUCT_LIMIT", 500, 1, 1_000_000);
  const memberLimit = getIntegerSetting("BILLING_TRIAL_MEMBER_LIMIT", 3, 1, 10_000);
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const verificationAction = buildAuthActionToken("verify_email", 24 * 60 * 60 * 1000);
  const created = await db.transaction(async (tx) => {
    const [softwareProduct] = await tx.select({ id: softwareProducts.id })
      .from(softwareProducts).where(eq(softwareProducts.code, "geekprice")).limit(1);
    if (!softwareProduct) throw new Error("O produto GeekPrice ainda não foi configurado.");
    const [organization] = await tx.insert(organizations).values({
      name: input.storeName.trim(),
      slug: createOrganizationSlug(input.storeName),
    }).returning({ id: organizations.id });
    const [user] = await tx.insert(users).values({
      name: input.name.trim(),
      email,
      passwordHash,
    }).returning({ id: users.id });
    await tx.insert(memberships).values({ organizationId: organization.id, userId: user.id, role: "owner" });
    await tx.insert(subscriptions).values({
      organizationId: organization.id,
      softwareProductId: softwareProduct.id,
      plan: "trial",
      status: "trialing",
      productLimit,
      memberLimit,
      trialEndsAt,
    });
    await tx.insert(legalAcceptances).values([
      { userId: user.id, organizationId: organization.id, document: "terms", version: input.termsVersion },
      { userId: user.id, organizationId: organization.id, document: "privacy", version: input.privacyVersion },
    ]);
    await tx.insert(authActionTokens).values({
      userId: user.id,
      ...verificationAction.record,
    });
    return { userId: user.id };
  });

  return { ...created, email, verificationToken: verificationAction.token };
}
