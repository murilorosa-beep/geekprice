import { z } from "zod";

const money = z.coerce.number().finite().min(0).max(99_999_999.99).transform((value) => value.toFixed(2));
export const inventoryInputSchema = z.object({
  catalogSource: z.enum(["tcgdex", "scryfall"]).optional(), canonicalId: z.string().trim().min(1).max(180).optional(),
  name: z.string().trim().min(2).max(240), category: z.string().trim().min(2).max(80),
  sku: z.string().trim().min(1).max(120), setName: z.string().trim().max(180).optional().default(""),
  collectorNumber: z.string().trim().max(60).optional().default(""), language: z.string().trim().max(12).default("pt-BR"),
  condition: z.string().trim().max(40).default("new"), finish: z.string().trim().max(40).default("standard"),
  cost: money, price: money, quantity: z.coerce.number().int().min(0).max(1_000_000),
  desiredMarginPercent: z.coerce.number().min(0).max(99).transform((value) => value.toFixed(4)),
});
export const inventoryUpdateSchema = inventoryInputSchema.pick({ cost: true, price: true, quantity: true, desiredMarginPercent: true }).partial().refine((value) => Object.keys(value).length > 0);
export const inventoryQuerySchema = z.object({
  q: z.string().trim().max(120).default(""), category: z.string().trim().max(80).optional(),
  availability: z.enum(["all", "in_stock", "out_of_stock"]).default("all"),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
