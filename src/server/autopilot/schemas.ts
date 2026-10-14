import { z } from "zod";

export const priceChannelSchema = z.enum(["counter", "ecommerce", "marketplace"]);
export const priceRoundingModeSchema = z.enum(["none", "ends_90", "ends_99", "round_integer"]);

export const pricingRuleBaseSchema = z.object({
  name: z.string().trim().min(2, "Nome da regra deve ter pelo menos 2 caracteres").max(160),
  channel: priceChannelSchema.default("counter"),
  category: z.string().trim().max(80).optional().nullable(),
  rarity: z.string().trim().max(120).optional().nullable(),
  finish: z.string().trim().max(40).optional().nullable(),
  feePercent: z.coerce.number().min(0).max(99).default(12),
  additionalCostPercent: z.coerce.number().min(0).max(99).default(0),
  minimumMarginPercent: z.coerce.number().min(0).max(99).default(20),
  desiredMarginPercent: z.coerce.number().min(0).max(99).default(25),
  marketDiscountPercent: z.coerce.number().min(0).max(99).default(3),
  maxChangePercent: z.coerce.number().min(0).max(100).default(15),
  roundingMode: priceRoundingModeSchema.default("ends_90"),
  autoApplySafe: z.boolean().default(false),
  active: z.boolean().default(true),
  priority: z.coerce.number().int().min(1).max(100).default(10),
});

export const createPricingRuleSchema = pricingRuleBaseSchema.refine(
  (data) => data.feePercent + data.additionalCostPercent + data.minimumMarginPercent < 100,
  {
    message: "A soma de taxas, custos adicionais e margem mínima deve ser menor que 100%.",
    path: ["minimumMarginPercent"],
  }
);

export const updatePricingRuleSchema = pricingRuleBaseSchema.partial();

export const applyBatchInputSchema = z.object({
  channel: priceChannelSchema.default("counter"),
  itemIds: z.array(z.string().uuid()).optional(),
  applyAllSafe: z.boolean().optional().default(false),
  notes: z.string().max(250).optional(),
});

export const rollbackBatchInputSchema = z.object({
  batchId: z.string().uuid("ID do lote inválido"),
});
