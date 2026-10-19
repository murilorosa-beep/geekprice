import Decimal from "decimal.js";
import { z } from "zod";

export const collectionCategories = { manga: "Mangá", comic: "HQ", figure: "Figure", game: "Jogo", card: "Carta autoral / outra carta", other: "Outro" };
export const collectionStatuses = { owned: "Na coleção", wishlist: "Quero ter", ordered: "A caminho", loaned: "Emprestado" };
export const commissionCategories = { cosplay: "Cosplay", craft: "Artesanato", print3d: "Impressão 3D", other: "Outro" };
export const commissionStatuses = { quote: "Orçamento", approved: "Aprovada", production: "Em produção", ready: "Pronta", delivered: "Entregue", canceled: "Cancelada" };
const money = z.union([z.string().trim().min(1), z.number()]).transform(Number).pipe(z.number().finite().min(0).max(99_999_999.99)).transform((n) => n.toFixed(2));
const date = z.union([z.literal(""), z.iso.date()]).default("");
const short = (max: number) => z.string().trim().max(max).default("");
export const resourceIdSchema = z.uuid();
export const resourceQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  category: z.string().max(24).default(""),
  status: z.string().max(24).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  minPrice: z.coerce.number().finite().min(0).max(99_999_999.99).optional(),
  maxPrice: z.coerce.number().finite().min(0).max(99_999_999.99).optional(),
}).refine((value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, { path: ["maxPrice"], message: "O valor máximo deve ser maior ou igual ao mínimo." });

export const collectionInputSchema = z.object({
  title: z.string().trim().min(2).max(240),
  category: z.enum(["manga", "comic", "figure", "game", "card", "other"]),
  series: short(180), edition: short(100),
  status: z.enum(["owned", "wishlist", "ordered", "loaned"]),
  quantity: z.coerce.number().int().min(1).max(100000),
  purchasePrice: money, purchasedAt: date,
  imageUrl: z.union([z.literal(""), z.url({ protocol: /^https$/ }).max(2000)]).default(""),
  location: short(180), borrower: short(160), loanDueAt: date, notes: short(4000),
}).superRefine((value, ctx) => {
  if (value.status === "loaned" && !value.borrower) ctx.addIssue({ code: "custom", path: ["borrower"], message: "Informe para quem o item foi emprestado." });
}).transform((value) => value.status === "loaned" ? value : { ...value, borrower: "", loanDueAt: "" });

export const commissionInputSchema = z.object({
  title: z.string().trim().min(2).max(240),
  category: z.enum(["cosplay", "craft", "print3d", "other"]),
  customer: z.string().trim().min(2).max(160), contact: short(180),
  quantity: z.coerce.number().int().min(1).max(100000),
  status: z.enum(["quote", "approved", "production", "ready", "delivered", "canceled"]), dueAt: date,
  materials: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    quantity: z.coerce.number().finite().min(0.001).max(100000), unitCost: money,
  })).max(100),
  laborHours: z.coerce.number().finite().min(0).max(100000).transform((n) => n.toFixed(2)),
  hourlyRate: money, extraCosts: money,
  marginPercent: z.coerce.number().finite().min(0).max(95).transform((n) => n.toFixed(2)),
  totalPrice: money, paidAmount: money, notes: short(4000),
}).superRefine((value, ctx) => {
  if (new Decimal(value.paidAmount).gt(value.totalPrice)) ctx.addIssue({ code: "custom", path: ["paidAmount"], message: "O recebido não pode superar o valor combinado." });
  if (Number(value.marginPercent) < 0 || Number(value.marginPercent) > 95) return;
  const estimate = estimateCommission(value);
  if (new Decimal(estimate.suggestedPrice).gt(99_999_999.99)) ctx.addIssue({ code: "custom", path: ["materials"], message: "O orçamento excede o limite de valor." });
});

export type CollectionInput = z.output<typeof collectionInputSchema>;
export type CommissionInput = z.output<typeof commissionInputSchema>;
export type ResourceQuery = z.output<typeof resourceQuerySchema>;
export function estimateCommission(input: {
  materials: { quantity: number; unitCost: string | number }[];
  laborHours: string | number; hourlyRate: string | number; extraCosts: string | number;
  marginPercent: string | number; totalPrice: string | number; paidAmount: string | number;
}) {
  const materialsCost = input.materials.reduce((sum, item) => sum.plus(new Decimal(item.unitCost).mul(item.quantity)), new Decimal(0));
  const laborCost = new Decimal(input.laborHours).mul(input.hourlyRate);
  const totalCost = materialsCost.plus(laborCost).plus(input.extraCosts);
  const denominator = new Decimal(1).minus(new Decimal(input.marginPercent).div(100));
  if (denominator.lte(0)) throw new Error("Margem inválida.");
  return {
    materialsCost: materialsCost.toFixed(2), laborCost: laborCost.toFixed(2), totalCost: totalCost.toFixed(2),
    suggestedPrice: totalCost.div(denominator).toDecimalPlaces(2, Decimal.ROUND_CEIL).toFixed(2),
    estimatedProfit: new Decimal(input.totalPrice).minus(totalCost).toFixed(2),
    remaining: new Decimal(input.totalPrice).minus(input.paidAmount).toFixed(2),
  };
}
export function isOverdue(date: string, inactive: boolean, today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) {
  return Boolean(!inactive && date && date < today);
}
