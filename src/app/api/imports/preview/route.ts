import { requireOrganization, authErrorResponse } from "@/server/auth/context";
import { MAX_CSV_BYTES, parseInventoryCsv } from "@/server/imports/csv";

export async function POST(request: Request) {
  try {
    await requireOrganization("admin");
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Arquivo CSV obrigatório." }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".csv")) return Response.json({ error: "Envie um arquivo .csv." }, { status: 400 });
    if (file.size > MAX_CSV_BYTES) return Response.json({ error: "O arquivo excede 2 MB." }, { status: 413 });
    const result = parseInventoryCsv(await file.text());
    return Response.json({ ...result, previewLimited: false });
  } catch (error) { return authErrorResponse(error); }
}
