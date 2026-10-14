import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { billingPlans } from "@/db/schema";

export async function GET() {
  const plans = await db.select({
    id: billingPlans.id,
    code: billingPlans.code,
    name: billingPlans.name,
    description: billingPlans.description,
    monthlyPrice: billingPlans.monthlyPrice,
    productLimit: billingPlans.productLimit,
    memberLimit: billingPlans.memberLimit,
  }).from(billingPlans).where(eq(billingPlans.active, true)).orderBy(asc(billingPlans.displayOrder));
  return Response.json(plans.map((plan) => ({
    ...plan,
    checkoutAvailable: plan.monthlyPrice !== null && Number(plan.monthlyPrice) > 0,
  })));
}
