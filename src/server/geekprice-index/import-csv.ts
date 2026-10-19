import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { parseBrl, type IndexGame, type IndexQuote } from "./core";

export const MAX_INDEX_CSV_BYTES = 8 * 1024 * 1024;
export const MAX_INDEX_CSV_ROWS = 15_000;
export const INDEX_CSV_HEADER = "game,name,canonical_id,set_name,set_code,collector_number,image_url,language,finish,condition,price_min_brl,provider_average_brl,price_max_brl,observed_at,source_url,source_external_id";

export type IndexImportMetadata = {
  sourceCode: string; sourceName: string; sourceBaseUrl: string;
  acquisitionMethod: "authorized_csv" | "partner_export" | "public_historical_archive";
  rightsReference: string; sourceSnapshotAt: string;
};
export type IndexImportRow = { quote: IndexQuote | null; game: IndexGame; name: string; canonicalId: string;
  setName: string; setCode: string; collectorNumber: string; imageUrl: string | null;
  language: string | null; finish: string | null; condition: string | null };
export type IndexImportError = { row: number; message: string };

function optional(value: string) { return value.trim() || null; }
function bounded(value: string, name: string, max: number) {
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${name} ausente ou longo demais.`);
  return text;
}
function httpsUrl(value: string, name: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} deve usar HTTPS.`);
  return url;
}
export function validateIndexImportMetadata(value: IndexImportMetadata) {
  if (!/^[a-z0-9_]{3,40}$/.test(value.sourceCode)) throw new Error("Código da fonte inválido.");
  bounded(value.sourceName, "Nome da fonte", 120);
  const base = httpsUrl(value.sourceBaseUrl, "URL da fonte");
  if (!["authorized_csv", "partner_export", "public_historical_archive"].includes(value.acquisitionMethod))
    throw new Error("Método de aquisição inválido.");
  bounded(value.rightsReference, "Referência de direitos/procedência", 1000);
  const snapshot = new Date(value.sourceSnapshotAt);
  if (!Number.isFinite(snapshot.getTime()) || snapshot.getTime() > Date.now() + 86_400_000)
    throw new Error("Data do retrato inválida.");
  return { ...value, sourceBaseUrl: base.origin, sourceSnapshotAt: snapshot.toISOString() };
}

export function parseIndexImportCsv(content: string, metadata: IndexImportMetadata) {
  const meta = validateIndexImportMetadata(metadata);
  if (Buffer.byteLength(content, "utf8") > MAX_INDEX_CSV_BYTES) throw new Error("CSV excede 8 MB.");
  const raw = parse(content, { columns: true, skip_empty_lines: true, bom: true, trim: true,
    relax_column_count: false }) as Record<string, string>[];
  const header = content.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0].trim();
  if (header !== INDEX_CSV_HEADER) throw new Error(`Cabeçalho inválido. Use: ${INDEX_CSV_HEADER}`);
  if (raw.length > MAX_INDEX_CSV_ROWS) throw new Error(`CSV excede ${MAX_INDEX_CSV_ROWS} linhas.`);
  const rows: IndexImportRow[] = [];
  const errors: IndexImportError[] = [];
  const seen = new Set<string>();
  for (const [index, record] of raw.entries()) {
    const line = index + 2;
    try {
      if (record.game !== "pokemon" && record.game !== "magic") throw new Error("Jogo deve ser pokemon ou magic.");
      const game = record.game;
      const name = bounded(record.name, "Nome", 240);
      const canonicalId = bounded(record.canonical_id, "ID canônico", 180);
      const setName = bounded(record.set_name, "Coleção", 180);
      const setCode = bounded(record.set_code, "Código da coleção", 40);
      const collectorNumber = bounded(record.collector_number, "Número", 60);
      const imageUrl = optional(record.image_url);
      if (imageUrl) httpsUrl(imageUrl, "Imagem");
      const language = optional(record.language), finish = optional(record.finish), condition = optional(record.condition);
      const identity = `${game}|${canonicalId}`;
      if (seen.has(identity)) throw new Error("Impressão duplicada no arquivo.");
      const min = optional(record.price_min_brl), avg = optional(record.provider_average_brl), max = optional(record.price_max_brl);
      const priced = Boolean(min || avg || max);
      let quote: IndexQuote | null = null;
      if (priced) {
        if (!min || !max) throw new Error("Preço mínimo e máximo são obrigatórios quando há cotação.");
        const priceMin = parseBrl(min), priceMax = parseBrl(max), providerAverage = avg ? parseBrl(avg) : null;
        if (Number(priceMin) > Number(priceMax) || (providerAverage &&
          (Number(providerAverage) < Number(priceMin) || Number(providerAverage) > Number(priceMax))))
          throw new Error("Média ou intervalo de preços inconsistente.");
        const observedAt = new Date(record.observed_at);
        if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > new Date(meta.sourceSnapshotAt).getTime() + 86_400_000)
          throw new Error("Data da observação inválida ou posterior ao retrato.");
        const url = httpsUrl(bounded(record.source_url, "URL da cotação", 1000), "URL da cotação");
        if (url.origin !== meta.sourceBaseUrl) throw new Error("URL da cotação não pertence à fonte declarada.");
        quote = { game, name, canonicalId, setName, setCode, collectorNumber,
          sourceExternalId: optional(record.source_external_id) ?? canonicalId, sourceUrl: url.toString(),
          priceMin, providerAverage, priceMax, availableQuantity: null, observedAt, language, finish, condition };
      } else if (record.observed_at || record.source_url || record.source_external_id)
        throw new Error("Linha sem preço não deve conter data ou URL de cotação.");
      rows.push({ game, name, canonicalId, setName, setCode, collectorNumber, imageUrl, language, finish, condition, quote });
      seen.add(identity);
    } catch (cause) { errors.push({ row: line, message: cause instanceof Error ? cause.message : "Linha inválida." }); }
  }
  const pricedRows = rows.filter((row) => row.quote).length;
  return { meta, rows, errors, totalRows: raw.length, validRows: rows.length,
    pricedRows, unpricedRows: rows.length - pricedRows,
    hash: createHash("sha256").update(content).digest("hex") };
}
