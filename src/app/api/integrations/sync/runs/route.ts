import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrationConnections, syncRuns } from "@/db/schema";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";

export async function GET() {
  try {
    const ctx = await requireOrganization("member");

    const runs = await db
      .select({
        id: syncRuns.id,
        connectionId: syncRuns.connectionId,
        connectionName: integrationConnections.name,
        status: syncRuns.status,
        source: syncRuns.source,
        createdCount: syncRuns.createdCount,
        updatedCount: syncRuns.updatedCount,
        skippedCount: syncRuns.skippedCount,
        conflictCount: syncRuns.conflictCount,
        errorCount: syncRuns.errorCount,
        errors: syncRuns.errors,
        startedAt: syncRuns.startedAt,
        completedAt: syncRuns.completedAt,
      })
      .from(syncRuns)
      .innerJoin(
        integrationConnections,
        eq(integrationConnections.id, syncRuns.connectionId)
      )
      .where(eq(syncRuns.organizationId, ctx.organizationId))
      .orderBy(desc(syncRuns.startedAt))
      .limit(20);

    return Response.json({ runs });
  } catch (error) {
    return authErrorResponse(error);
  }
}
