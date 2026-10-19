import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { assertPublicActionAllowed, PublicActionRateLimitError } from "@/server/auth/public-rate-limit";

export async function indexRead(request: Request, work: () => Promise<unknown>) {
  try {
    const actor = await requireOrganization("member");
    await assertPublicActionAllowed(request, `index-read:${actor.organizationId}`, 120, 60_000);
    return Response.json({ data: await work(), version: "v1" }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    if (error instanceof PublicActionRateLimitError) return Response.json({ error: error.message }, { status: 429 });
    return authErrorResponse(error);
  }
}
