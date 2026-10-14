import { z } from "zod";

export const catalogQuerySchema = z.object({
  name: z.string().trim().max(120).optional(), set: z.string().trim().max(120).optional(),
  number: z.string().trim().max(40).optional(), language: z.string().trim().default("pt-br"),
}).refine((value) => value.name || value.set || value.number, "Informe nome, coleção ou número.");

export const linkCardSchema = z.object({
  inventoryItemId: z.string().uuid(), externalCardId: z.string().min(1).max(160),
  language: z.string().trim().default("pt-br"), externalVariantId: z.string().max(160).optional(),
});

export const marketQuerySchema = z.object({
  inventoryItemId: z.string().uuid().optional(), currency: z.enum(["BRL", "USD", "EUR"]).optional(),
  source: z.string().max(160).optional(), finish: z.string().max(40).optional(),
  days: z.coerce.number().int().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30),
});
