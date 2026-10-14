import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { deleteOrganizationConnection } from "@/server/commerce/service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrganization("admin");
    const { id } = await params;
    const deleted = await deleteOrganizationConnection(ctx.organizationId, id);

    if (!deleted) {
      return Response.json({ error: "Conexão não encontrada." }, { status: 404 });
    }

    return Response.json({ success: true, id });
  } catch (error) {
    return authErrorResponse(error);
  }
}
