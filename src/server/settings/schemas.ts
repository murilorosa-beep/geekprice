import { z } from "zod";

const percent = z.coerce.number().finite().min(0).max(99).transform((value) => value.toFixed(4));

export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(2).max(160),
  tradeName: z.string().trim().max(160).optional().default(""),
  currency: z.literal("BRL"),
});

export const pricingPolicySchema = z.object({
  name: z.string().trim().min(2).max(120),
  feePercent: percent,
  additionalCostPercent: percent,
  minimumMarginPercent: percent,
  desiredMarginPercent: percent,
  marketDiscountPercent: percent,
}).superRefine((value, context) => {
  if (Number(value.feePercent) + Number(value.additionalCostPercent) + Number(value.minimumMarginPercent) >= 100) {
    context.addIssue({ code: "custom", path: ["minimumMarginPercent"], message: "Taxas, custos e margem mínima devem somar menos de 100%." });
  }
  if (Number(value.desiredMarginPercent) < Number(value.minimumMarginPercent)) {
    context.addIssue({ code: "custom", path: ["desiredMarginPercent"], message: "A margem desejada não pode ser menor que a margem mínima." });
  }
});
