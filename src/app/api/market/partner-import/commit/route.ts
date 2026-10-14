import { z } from "zod";
import { requireOrganization, authErrorResponse } from "@/server/auth/context";
import { brlMarketRowSchema } from "@/server/market/partner-csv";
import { BrlMarketImportError, importBrlMarketReferences } from "@/server/market/partner-import";
import { verifyBrlImportPreview } from "@/server/market/preview-token";

const commitSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/, "Hash de arquivo inválido."),
  rows: z.array(brlMarketRowSchema).min(1, "Ao menos uma linha deve ser enviada.").max(2000),
  previewToken: z.string().max(100),
});

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin");
    const json = await request.json();
    const input = commitSchema.parse(json);
    if (!verifyBrlImportPreview(input.previewToken, actor.organizationId, input.hash, input.rows)) {
      return Response.json({ error: "Previa invalida ou expirada. Envie o CSV novamente." }, { status: 403 });
    }

    const result = await importBrlMarketReferences(actor.organizationId, input.rows);

    return Response.json(
      {
        success: true,
        ...result,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof BrlMarketImportError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return authErrorResponse(error);
  }
}
