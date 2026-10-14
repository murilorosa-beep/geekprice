import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { inventoryInputSchema } from "@/server/inventory/schemas";

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 2_000;
export type CsvError = { row: number; field?: string; message: string };

const headerAliases: Record<string, string> = {
  produto: "name", nome: "name", categoria: "category", sku: "sku", colecao: "setName",
  numero: "collectorNumber", idioma: "language", condicao: "condition", acabamento: "finish",
  custo: "cost", preco: "price", quantidade: "quantity", margem: "desiredMarginPercent",
};

export function parseInventoryCsv(content: string) {
  const records = parse(content, { columns: (headers: string[]) => headers.map((header) => headerAliases[header.trim().toLowerCase()] ?? header.trim()), skip_empty_lines: true, trim: true, bom: true, relax_column_count: false }) as Record<string, string>[];
  if (records.length > MAX_CSV_ROWS) throw new Error(`O arquivo excede o limite de ${MAX_CSV_ROWS} linhas.`);
  const seen = new Set<string>(); const errors: CsvError[] = []; const valid: Array<z.infer<typeof inventoryInputSchema>> = [];
  records.forEach((record, index) => {
    const row = index + 2; const sku = record.sku?.toLowerCase();
    if (sku && seen.has(sku)) { errors.push({ row, field: "sku", message: "SKU duplicado no arquivo." }); return; }
    if (sku) seen.add(sku);
    const parsed = inventoryInputSchema.safeParse(record);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => errors.push({ row, field: issue.path.join("."), message: issue.message })); return;
    }
    valid.push(parsed.data);
  });
  return { valid, errors, totalRows: records.length, hash: createHash("sha256").update(content).digest("hex") };
}
