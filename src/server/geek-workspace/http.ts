import "server-only";
import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { collectionInputSchema, commissionInputSchema, resourceIdSchema, resourceQuerySchema } from "@/lib/geek-workspace";
import { deleteWorkspaceItem, listCollection, listCommissions, saveCollection, saveCommission, WorkspaceError } from "./service";

type Kind = "collections" | "commissions";
function respond(error: unknown) {
  if (error instanceof WorkspaceError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return Response.json({ error: "JSON inválido." }, { status: 400 });
  return authErrorResponse(error);
}
export async function workspaceList(kind: Kind, request: Request) {
  try {
    const actor = await requireOrganization();
    const query = resourceQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await (kind === "collections" ? listCollection(actor.organizationId, query) : listCommissions(actor.organizationId, query)));
  } catch (error) { return respond(error); }
}
export async function workspaceSave(kind: Kind, request: Request, id?: string) {
  try {
    const actor = await requireOrganization("admin");
    if (id) resourceIdSchema.parse(id);
    const body = await request.json();
    const version = id ? z.object({ version: z.number().int().positive() }).parse(body).version : undefined;
    const result = kind === "collections"
      ? await saveCollection(actor.organizationId, collectionInputSchema.parse(body), id, version)
      : await saveCommission(actor.organizationId, commissionInputSchema.parse(body), id, version);
    return Response.json(result, { status: id ? 200 : 201 });
  } catch (error) { return respond(error); }
}
export async function workspaceDelete(kind: Kind, request: Request, id: string) {
  try {
    const actor = await requireOrganization("admin");
    resourceIdSchema.parse(id);
    const version = z.coerce.number().int().positive().parse(new URL(request.url).searchParams.get("version"));
    await deleteWorkspaceItem(kind, actor.organizationId, id, version);
    return new Response(null, { status: 204 });
  } catch (error) { return respond(error); }
}
