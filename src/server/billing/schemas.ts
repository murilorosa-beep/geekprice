import { z } from "zod";

const monthlyPriceSchema = z.preprocess(
  (value) => value === "" || value === null ? null : value,
  z.coerce.number().finite().positive().max(1_000_000).nullable(),
);

export const billingPlanSchema = z.object({
  softwareProductId: z.uuid(),
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(""),
  monthlyPrice: monthlyPriceSchema,
  yearlyPrice: monthlyPriceSchema,
  productLimit: z.coerce.number().int().min(1).max(1_000_000),
  memberLimit: z.coerce.number().int().min(1).max(10_000),
  trialDays: z.coerce.number().int().min(0).max(90).default(14),
  gracePeriodDays: z.coerce.number().int().min(0).max(30).default(5),
  features: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  active: z.boolean().default(false),
  displayOrder: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const billingPlanUpdateSchema = billingPlanSchema.omit({
  description: true,
  active: true,
  displayOrder: true,
}).extend({
  description: z.string().trim().max(500),
  active: z.boolean(),
  displayOrder: z.coerce.number().int().min(0).max(100_000),
});

export const softwareProductSchema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,80}$/),
  name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(220).default(""),
  description: z.string().trim().max(4000).default(""),
  icon: z.string().trim().max(40).default("sparkles"),
  accent: z.enum(["violet", "blue", "green", "amber"]).default("violet"),
  appPath: z.string().trim().startsWith("/").max(160).default("/dashboard"),
  marketingFeatures: z.array(z.string().trim().min(1).max(140)).max(20).default([]),
  active: z.boolean().default(false),
  featured: z.boolean().default(false),
  displayOrder: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const couponSchema = z.object({
  softwareProductId: z.uuid().nullable().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/),
  type: z.enum(["percentage", "fixed"]),
  value: z.coerce.number().positive().max(1_000_000),
  durationMonths: z.coerce.number().int().min(1).max(36).default(1),
  maxRedemptions: z.coerce.number().int().positive().max(1_000_000).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  active: z.boolean().default(false),
}).refine((value) => value.type !== "percentage" || value.value <= 100, {
  message: "Desconto percentual não pode ultrapassar 100%.",
  path: ["value"],
});
