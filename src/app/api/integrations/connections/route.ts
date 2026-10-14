import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { createWooCommerceConnection, listOrganizationConnections } from "@/server/commerce/service";

const createConnectionSchema = z.object({
  kind: z.literal("woocommerce"),
  name: z.string().min(2, "Nome da conexão é obrigatório").max(100),
  storeUrl: z.string().min(3, "URL da loja é obrigatória"),
  consumerKey: z.string().min(5, "Consumer Key é obrigatória"),
  consumerSecret: z.string().min(5, "Consumer Secret é obrigatória"),
});

export async function GET() {
  try {
    const ctx = await requireOrganization("member");
    const connections = await listOrganizationConnections(ctx.organizationId);
    return Response.json({ connections });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireOrganization("admin");
    const json = await request.json();
    const input = createConnectionSchema.parse(json);

    const result = await createWooCommerceConnection(ctx.organizationId, {
      name: input.name,
      storeUrl: input.storeUrl,
      consumerKey: input.consumerKey,
      consumerSecret: input.consumerSecret,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
