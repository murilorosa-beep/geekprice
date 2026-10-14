import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { billingPlans, softwareProducts } from "@/db/schema";
import { requireBillingAdministrator } from "@/server/billing/admin";
import { billingPlanSchema } from "@/server/billing/schemas";

export async function GET() {
  if (!await requireBillingAdministrator()) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const plans = await db.select({
    id: billingPlans.id,
    softwareProductId: billingPlans.softwareProductId,
    code: billingPlans.code,
    name: billingPlans.name,
    description: billingPlans.description,
    monthlyPrice: billingPlans.monthlyPrice,
    yearlyPrice: billingPlans.yearlyPrice,
    productLimit: billingPlans.productLimit,
    memberLimit: billingPlans.memberLimit,
    trialDays: billingPlans.trialDays,
    gracePeriodDays: billingPlans.gracePeriodDays,
    features: billingPlans.features,
    active: billingPlans.active,
    displayOrder: billingPlans.displayOrder,
    createdAt: billingPlans.createdAt,
    updatedAt: billingPlans.updatedAt,
    softwareName: softwareProducts.name,
    softwareCode: softwareProducts.code,
  }).from(billingPlans)
    .leftJoin(softwareProducts, eq(softwareProducts.id, billingPlans.softwareProductId))
    .orderBy(asc(billingPlans.displayOrder));
  return Response.json(plans);
}

export async function POST(request: Request) {
  if (!await requireBillingAdministrator()) return Response.json({ error: "Acesso negado." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Corpo JSON inválido." }, { status: 400 }); }

  if (typeof body === "object" && body !== null && !("softwareProductId" in body)) {
    const [geekprice] = await db.select({ id: softwareProducts.id })
      .from(softwareProducts).where(eq(softwareProducts.code, "geekprice")).limit(1);
    if (geekprice) {
      body = { ...body, softwareProductId: geekprice.id };
    }
  }

  const parsed = billingPlanSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Dados do plano inválidos.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  const [plan] = await db.insert(billingPlans).values({
    ...parsed.data,
    monthlyPrice: parsed.data.monthlyPrice != null ? parsed.data.monthlyPrice.toFixed(2) : null,
    yearlyPrice: parsed.data.yearlyPrice != null ? parsed.data.yearlyPrice.toFixed(2) : null,
  }).returning();
  return Response.json(plan, { status: 201 });
}
