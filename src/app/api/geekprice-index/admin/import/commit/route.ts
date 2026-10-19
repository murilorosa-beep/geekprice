import { z } from "zod";
import { requireBillingAdministrator } from "@/server/billing/admin";
import { MAX_INDEX_CSV_BYTES, parseIndexImportCsv } from "@/server/geekprice-index/import-csv";
import { importIndexCsv } from "@/server/geekprice-index/import-service";
import { verifyIndexImportPreview } from "@/server/geekprice-index/import-token";

const metadataSchema = z.object({ sourceCode: z.string(), sourceName: z.string(), sourceBaseUrl: z.string(),
  acquisitionMethod: z.enum(["authorized_csv", "partner_export", "public_historical_archive"]),
  rightsReference: z.string(), sourceSnapshotAt: z.string() });
function localImportEnabled() {
  if (process.env.INDEX_IMPORT_ENABLED !== "true" || process.env.APP_ENV === "production") return false;
  try { const url = new URL(process.env.DATABASE_URL ?? "");
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      decodeURIComponent(url.pathname.slice(1)) === "geekprice_index_dev";
  } catch { return false; }
}

export async function POST(request: Request) {
  const admin = await requireBillingAdministrator();
  if (!admin?.id) return Response.json({ error: "Permissão insuficiente." }, { status: 403 });
  if (!localImportEnabled()) return Response.json({ error: "Importação desabilitada fora do banco local isolado." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file"), metadata = form.get("metadata"), token = form.get("previewToken");
    if (!(file instanceof File) || typeof metadata !== "string" || typeof token !== "string" || !file.name.toLowerCase().endsWith(".csv"))
      return Response.json({ error: "CSV, metadados e prévia obrigatórios." }, { status: 400 });
    if (file.size > MAX_INDEX_CSV_BYTES) return Response.json({ error: "CSV excede 8 MB." }, { status: 413 });
    const parsed = parseIndexImportCsv(await file.text(), metadataSchema.parse(JSON.parse(metadata)));
    if (!verifyIndexImportPreview(token, admin.id, parsed.hash, parsed.meta))
      return Response.json({ error: "Prévia inválida ou expirada. Valide o arquivo novamente." }, { status: 403 });
    if (parsed.errors.length) return Response.json({ error: "CSV contém erros.", errors: parsed.errors.slice(0, 100) }, { status: 422 });
    const result = await importIndexCsv(parsed, file.name);
    return Response.json({ data: result }, { status: 201 });
  } catch (cause) { return Response.json({ error: cause instanceof Error ? cause.message : "Falha na importação." }, { status: 422 }); }
}
