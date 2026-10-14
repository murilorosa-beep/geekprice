import { requireOrganization, authErrorResponse } from "@/server/auth/context";
import { MAX_BRL_CSV_BYTES, parseBrlMarketCsv } from "@/server/market/partner-csv";
import { signBrlImportPreview } from "@/server/market/preview-token";

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin");
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Arquivo CSV obrigatório." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return Response.json({ error: "Envie um arquivo no formato .csv." }, { status: 400 });
    }

    if (file.size > MAX_BRL_CSV_BYTES) {
      return Response.json({ error: "O arquivo excede o limite de 2 MB." }, { status: 413 });
    }

    const content = await file.text();
    const result = parseBrlMarketCsv(content);

    return Response.json({
      ...result,
      previewSample: result.valid.slice(0, 5),
      previewToken: result.errors.length === 0
        ? signBrlImportPreview(actor.organizationId, result.hash, result.valid)
        : null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
