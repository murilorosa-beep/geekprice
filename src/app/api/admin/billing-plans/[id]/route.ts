import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { billingPlans } from "@/db/schema";
import { requireBillingAdministrator } from "@/server/billing/admin";
import { billingPlanUpdateSchema } from "@/server/billing/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireBillingAdministrator()) return Response.json({ error: "Acesso negado." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Corpo JSON inválido." }, { status: 400 }); }
  const parsed = billingPlanUpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Dados do plano inválidos.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Identificador do plano inválido." }, { status: 400 });
  const [plan] = await db.update(billingPlans).set({
    ...parsed.data,
    monthlyPrice: parsed.data.monthlyPrice != null ? parsed.data.monthlyPrice.toFixed(2) : null,
    yearlyPrice: parsed.data.yearlyPrice != null ? parsed.data.yearlyPrice.toFixed(2) : null,
    updatedAt: new Date(),
  }).where(eq(billingPlans.id, id)).returning();
  return plan ? Response.json(plan) : Response.json({ error: "Plano não encontrado." }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireBillingAdministrator()) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Identificador do plano inválido." }, { status: 400 });
  const [plan] = await db.delete(billingPlans).where(eq(billingPlans.id, id)).returning({ id: billingPlans.id });
  return plan ? new Response(null, { status: 204 }) : Response.json({ error: "Plano não encontrado." }, { status: 404 });
}
