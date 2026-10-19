import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { assertPublicActionAllowed, PublicActionRateLimitError } from "@/server/auth/public-rate-limit";
import { countIndexSearchCards, searchIndexCards } from "@/server/geekprice-index/service";

const querySchema = z.object({ q: z.string().trim().min(2).max(120), game: z.enum(["pokemon", "magic"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20), page: z.coerce.number().int().min(1).max(1000).default(1) });

export async function GET(request: Request) {
  try {
    const actor = await requireOrganization("member");
    await assertPublicActionAllowed(request, `index-read:${actor.organizationId}`, 120, 60_000);
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [data, total] = await Promise.all([searchIndexCards(query), countIndexSearchCards(query)]);
    return Response.json({ data, pagination: { page: query.page, pageSize: query.limit, total,
      pages: Math.ceil(total / query.limit) }, version: "v1" },
      { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    if (error instanceof PublicActionRateLimitError) return Response.json({ error: error.message }, { status: 429 });
    return authErrorResponse(error);
  }
}
