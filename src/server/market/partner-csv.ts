import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { z } from "zod";

export const MAX_BRL_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_BRL_CSV_ROWS = 2_000;

export type BrlCsvError = {
  row: number;
  field?: string;
  message: string;
};

export const brlMarketRowSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(1, "Nome do produto não pode ser vazio.")
    .max(240),
  setName: z.string().trim().max(180).optional().nullable(),
  collectorNumber: z.string().trim().max(60).optional().nullable(),
  language: z.string().trim().max(12).default("pt-BR"),
  condition: z.string().trim().max(40).default("NM"),
  finish: z.string().trim().max(40).default("standard"),
  sourceName: z
    .string()
    .trim()
    .min(1, "Fonte é obrigatória.")
    .max(160)
    .default("Referência Nacional BRL"),
  priceType: z
    .enum(["listing", "completed_sale", "reference"])
    .default("reference"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => val === "BRL", {
      message: "A moeda deve ser estritamente BRL para o mercado brasileiro.",
    }),
  price: z.coerce
    .number()
    .positive("O valor deve ser maior que zero (não-negativo)."),
  shippingPrice: z.coerce.number().min(0).default(0),
  referenceAt: z.coerce.date().refine((d) => {
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return d >= thirtyDaysAgo && d <= tomorrow;
  }, "A data de referência deve ser dos últimos 30 dias."),
  url: z.string().url().max(1000).optional().nullable().or(z.literal("")),
});

export type BrlMarketRowInput = z.infer<typeof brlMarketRowSchema>;

const headerAliases: Record<string, string> = {
  produto: "productName",
  nome: "productName",
  name: "productName",
  colecao: "setName",
  set: "setName",
  setname: "setName",
  numero: "collectorNumber",
  number: "collectorNumber",
  codigo: "collectorNumber",
  collectornumber: "collectorNumber",
  idioma: "language",
  language: "language",
  condicao: "condition",
  condition: "condition",
  estado: "condition",
  acabamento: "finish",
  finish: "finish",
  fonte: "sourceName",
  source: "sourceName",
  sourcename: "sourceName",
  tipo_preco: "priceType",
  tipo: "priceType",
  pricetype: "priceType",
  moeda: "currency",
  currency: "currency",
  valor: "price",
  preco: "price",
  price: "price",
  frete: "shippingPrice",
  shipping: "shippingPrice",
  shippingprice: "shippingPrice",
  data_referencia: "referenceAt",
  data: "referenceAt",
  referenceat: "referenceAt",
  referencedate: "referenceAt",
  url: "url",
  link: "url",
};

export function parseBrlMarketCsv(content: string) {
  const records = parse(content, {
    columns: (headers: string[]) =>
      headers.map((header) => {
        const normalized = header.trim().toLowerCase().replace(/[\s_-]+/g, "_");
        return headerAliases[normalized] ?? normalized;
      }),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  if (records.length > MAX_BRL_CSV_ROWS) {
    throw new Error(`O arquivo excede o limite de ${MAX_BRL_CSV_ROWS} linhas.`);
  }

  const errors: BrlCsvError[] = [];
  const valid: BrlMarketRowInput[] = [];

  records.forEach((record, index) => {
    const row = index + 2; // Linha 1 é o cabeçalho
    const parsed = brlMarketRowSchema.safeParse(record);

    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        errors.push({
          row,
          field: issue.path.join("."),
          message: issue.message,
        });
      });
      return;
    }

    valid.push(parsed.data);
  });

  const hash = createHash("sha256").update(content).digest("hex");

  return {
    valid,
    errors,
    totalRows: records.length,
    hash,
  };
}
