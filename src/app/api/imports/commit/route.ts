import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { importJobs, inventoryItems, subscriptions } from "@/db/schema";
import { requireOrganization, authErrorResponse } from "@/server/auth/context";
import { createInventoryBatch } from "@/server/inventory/service";
import { inventoryInputSchema } from "@/server/inventory/schemas";

const commitSchema = z.object({ fileName: z.string().min(1).max(240), hash: z.string().regex(/^[a-f0-9]{64}$/), rows: z.array(inventoryInputSchema).min(1).max(2000) });

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin"); const input = commitSchema.parse(await request.json());
    const [duplicate] = await db.select({ id: importJobs.id }).from(importJobs).where(and(eq(importJobs.organizationId, actor.organizationId), eq(importJobs.fileHash, input.hash))).limit(1);
    if (duplicate) return Response.json({ error: "Este arquivo já foi importado.", importId: duplicate.id }, { status: 409 });
    const [[usage], [subscription]] = await Promise.all([
      db.select({ value: count() }).from(inventoryItems).where(eq(inventoryItems.organizationId, actor.organizationId)),
      db.select({ productLimit: subscriptions.productLimit }).from(subscriptions).where(eq(subscriptions.organizationId, actor.organizationId)).limit(1),
    ]);
    const limit = subscription?.productLimit ?? 500;
    if ((usage?.value ?? 0) + input.rows.length > limit) return Response.json({ error: `A importação excede o limite de ${limit} produtos do plano.` }, { status: 422 });
    const [job] = await db.insert(importJobs).values({ organizationId: actor.organizationId, createdBy: actor.userId, status: "processing", fileName: input.fileName, fileHash: input.hash, totalRows: input.rows.length, validRows: input.rows.length }).returning();
    try {
      await createInventoryBatch(actor.organizationId, input.rows);
      await db.update(importJobs).set({ status: "completed", completedAt: new Date() }).where(eq(importJobs.id, job.id));
      return Response.json({ importId: job.id, imported: input.rows.length }, { status: 201 });
    } catch (error) {
      await db.update(importJobs).set({ status: "failed", errors: [{ message: "Falha ao persistir a importação." }], completedAt: new Date() }).where(eq(importJobs.id, job.id));
      throw error;
    }
  } catch (error) { return authErrorResponse(error); }
}
