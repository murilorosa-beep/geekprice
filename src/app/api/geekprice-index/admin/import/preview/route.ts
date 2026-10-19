import { z } from "zod";
import { requireBillingAdministrator } from "@/server/billing/admin";
import { MAX_INDEX_CSV_BYTES, parseIndexImportCsv } from "@/server/geekprice-index/import-csv";
import { signIndexImportPreview } from "@/server/geekprice-index/import-token";

const metadataSchema = z.object({ sourceCode: z.string(), sourceName: z.string(), sourceBaseUrl: z.string(),
  acquisitionMethod: z.enum(["authorized_csv", "partner_export", "public_historical_archive"]),
  rightsReference: z.string(), sourceSnapshotAt: z.string() });

export async function POST(request: Request) {
  const admin = await requireBillingAdministrator();
  if (!admin?.id) return Response.json({ error: "Permissão insuficiente." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file"), metadata = form.get("metadata");
    if (!(file instanceof File) || typeof metadata !== "string" || !file.name.toLowerCase().endsWith(".csv"))
      return Response.json({ error: "CSV e metadados obrigatórios." }, { status: 400 });
    if (file.size > MAX_INDEX_CSV_BYTES) return Response.json({ error: "CSV excede 8 MB." }, { status: 413 });
    const parsed = parseIndexImportCsv(await file.text(), metadataSchema.parse(JSON.parse(metadata)));
    return Response.json({ hash: parsed.hash, totalRows: parsed.totalRows, validRows: parsed.validRows,
      pricedRows: parsed.pricedRows, unpricedRows: parsed.unpricedRows, errors: parsed.errors.slice(0, 100),
      preview: parsed.rows.slice(0, 10).map((row) => ({ game: row.game, name: row.name,
        setName: row.setName, collectorNumber: row.collectorNumber, priceMin: row.quote?.priceMin ?? null,
        observedAt: row.quote?.observedAt.toISOString() ?? null })),
      previewToken: parsed.errors.length === 0 ? signIndexImportPreview(admin.id, parsed.hash, parsed.meta) : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) { return Response.json({ error: cause instanceof Error ? cause.message : "CSV inválido." }, { status: 400 }); }
}
