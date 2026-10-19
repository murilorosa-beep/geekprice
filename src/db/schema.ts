import { relations, sql } from "drizzle-orm";
import type { CollectionInput, CommissionInput } from "../lib/geek-workspace";
import {
  boolean, check, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable,
  primaryKey, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);
export const importStatus = pgEnum("import_status", ["pending", "processing", "completed", "failed"]);
export const alertSeverity = pgEnum("alert_severity", ["info", "warning", "critical"]);
export const subscriptionStatus = pgEnum("subscription_status", ["trialing", "active", "past_due", "canceled"]);
export const priceType = pgEnum("price_type", ["listing", "completed_sale", "reference"]);
export const marketRegion = pgEnum("market_region", ["BR", "international", "converted"]);
export const syncStatus = pgEnum("sync_status", ["running", "completed", "partial", "failed"]);
export const priceRoundingMode = pgEnum("price_rounding_mode", ["none", "ends_90", "ends_99", "round_integer"]);
export const priceChannel = pgEnum("price_channel", ["counter", "ecommerce", "marketplace"]);
export const priceSafetyStatus = pgEnum("price_safety_status", ["safe_auto", "flagged_spike", "flagged_margin_risk", "flagged_no_market", "unchanged", "suspicious_flagged"]);
export const batchStatus = pgEnum("batch_status", ["applied", "reverted"]);
export const billingInterval = pgEnum("billing_interval", ["monthly", "yearly"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "approved", "rejected", "refunded", "chargeback", "canceled"]);
export const discountType = pgEnum("discount_type", ["percentage", "fixed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export type CommissionMaterial = { name: string; quantity: number; unitCost: string };

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  tradeName: varchar("trade_name", { length: 160 }),
  currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex("organizations_slug_uidx").on(table.slug)]).enableRLS();

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  sessionVersion: integer("session_version").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("users_email_uidx").on(sql`lower(${table.email})`)]).enableRLS();

export const authActionTokens = pgTable("auth_action_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  purpose: varchar("purpose", { length: 32 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("auth_action_tokens_hash_uidx").on(table.tokenHash),
  index("auth_action_tokens_user_purpose_idx").on(table.userId, table.purpose),
]).enableRLS();

export const legalAcceptances = pgTable("legal_acceptances", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  document: varchar("document", { length: 32 }).notNull(),
  version: varchar("version", { length: 40 }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("legal_acceptances_org_user_idx").on(table.organizationId, table.userId),
]).enableRLS();

export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 254 }).notNull(),
  originHash: varchar("origin_hash", { length: 64 }).notNull(),
  failedAttempts: integer("failed_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("login_attempts_email_origin_uidx").on(table.email, table.originHash),
  index("login_attempts_cleanup_idx").on(table.lastAttemptAt),
]).enableRLS();

export const publicActionLimits = pgTable("public_action_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  action: varchar("action", { length: 64 }).notNull(),
  originHash: varchar("origin_hash", { length: 64 }).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).defaultNow().notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
}, (table) => [
  uniqueIndex("public_action_limits_action_origin_uidx").on(table.action, table.originHash),
  index("public_action_limits_locked_idx").on(table.lockedUntil),
]).enableRLS();

export const memberships = pgTable("memberships", {
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: memberRole("role").default("member").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.userId] }),
  index("memberships_user_idx").on(table.userId),
]).enableRLS();

export const geekCollectionItems = pgTable("geek_collection_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  category: varchar("category", { length: 24 }).$type<CollectionInput["category"]>().notNull(),
  series: varchar("series", { length: 180 }).default("").notNull(),
  edition: varchar("edition", { length: 100 }).default("").notNull(),
  status: varchar("status", { length: 24 }).$type<CollectionInput["status"]>().default("owned").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }).default("0").notNull(),
  purchasedAt: varchar("purchased_at", { length: 10 }).default("").notNull(),
  imageUrl: text("image_url").default("").notNull(),
  location: varchar("location", { length: 180 }).default("").notNull(),
  borrower: varchar("borrower", { length: 160 }).default("").notNull(),
  loanDueAt: varchar("loan_due_at", { length: 10 }).default("").notNull(),
  notes: text("notes").default("").notNull(),
  version: integer("version").default(1).notNull(),
  ...timestamps,
}, (table) => [
  index("geek_collections_org_updated_idx").on(table.organizationId, table.updatedAt),
  check("geek_collections_values_check", sql`${table.quantity} > 0 AND ${table.purchasePrice} >= 0 AND ${table.version} > 0`),
  check("geek_collections_category_check", sql`${table.category} IN ('manga','comic','figure','game','card','other')`),
  check("geek_collections_status_check", sql`${table.status} IN ('owned','wishlist','ordered','loaned')`),
  check("geek_collections_loan_check", sql`${table.status} <> 'loaned' OR length(trim(${table.borrower})) > 0`),
]).enableRLS();

export const geekCommissions = pgTable("geek_commissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  category: varchar("category", { length: 24 }).$type<CommissionInput["category"]>().notNull(),
  customer: varchar("customer", { length: 160 }).notNull(),
  contact: varchar("contact", { length: 180 }).default("").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  status: varchar("status", { length: 24 }).$type<CommissionInput["status"]>().default("quote").notNull(),
  dueAt: varchar("due_at", { length: 10 }).default("").notNull(),
  materials: jsonb("materials").$type<CommissionMaterial[]>().default([]).notNull(),
  laborHours: numeric("labor_hours", { precision: 10, scale: 2 }).default("0").notNull(),
  hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 }).default("0").notNull(),
  extraCosts: numeric("extra_costs", { precision: 12, scale: 2 }).default("0").notNull(),
  marginPercent: numeric("margin_percent", { precision: 5, scale: 2 }).default("30").notNull(),
  totalPrice: numeric("total_price", { precision: 12, scale: 2 }).default("0").notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  notes: text("notes").default("").notNull(),
  version: integer("version").default(1).notNull(),
  ...timestamps,
}, (table) => [
  index("geek_commissions_org_updated_idx").on(table.organizationId, table.updatedAt),
  check("geek_commissions_category_check", sql`${table.category} IN ('cosplay','craft','print3d','other')`),
  check("geek_commissions_status_check", sql`${table.status} IN ('quote','approved','production','ready','delivered','canceled')`),
  check("geek_commissions_values_check", sql`${table.quantity} > 0 AND ${table.laborHours} >= 0 AND ${table.hourlyRate} >= 0 AND ${table.extraCosts} >= 0 AND ${table.totalPrice} >= 0 AND ${table.paidAmount} >= 0 AND ${table.paidAmount} <= ${table.totalPrice} AND ${table.marginPercent} >= 0 AND ${table.marginPercent} <= 95 AND ${table.version} > 0`),
]).enableRLS();

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 240 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  brand: varchar("brand", { length: 120 }),
  imageUrl: text("image_url"),
  ...timestamps,
}, (table) => [index("products_name_idx").on(table.name), index("products_category_idx").on(table.category)]).enableRLS();

export const productVariants = pgTable("product_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  sku: varchar("sku", { length: 120 }).notNull(),
  setName: varchar("set_name", { length: 180 }),
  collectorNumber: varchar("collector_number", { length: 60 }),
  language: varchar("language", { length: 12 }).default("pt-BR").notNull(),
  condition: varchar("condition", { length: 40 }).default("new").notNull(),
  finish: varchar("finish", { length: 40 }).default("standard").notNull(),
  rarity: varchar("rarity", { length: 120 }),
  catalogSource: varchar("catalog_source", { length: 40 }),
  canonicalId: varchar("canonical_id", { length: 180 }),
  ...timestamps,
}, (table) => [index("product_variants_sku_idx").on(table.sku), uniqueIndex("product_variants_catalog_uidx").on(table.catalogSource, table.canonicalId, table.language, table.condition, table.finish), index("product_variants_product_idx").on(table.productId)]).enableRLS();

export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "restrict" }).notNull(),
  cost: numeric("cost", { precision: 14, scale: 2 }).notNull(),
  price: numeric("price", { precision: 14, scale: 2 }).notNull(),
  quantity: integer("quantity").default(0).notNull(),
  desiredMarginPercent: numeric("desired_margin_percent", { precision: 7, scale: 4 }).default("25").notNull(),
  organizationSku: varchar("organization_sku", { length: 120 }),
  barcode: varchar("barcode", { length: 32 }),
  ...timestamps,
}, (table) => [
  uniqueIndex("inventory_org_variant_uidx").on(table.organizationId, table.variantId),
  uniqueIndex("inventory_org_sku_uidx").on(table.organizationId, table.organizationSku),
  uniqueIndex("inventory_org_barcode_uidx").on(table.organizationId, table.barcode),
  index("inventory_org_updated_idx").on(table.organizationId, table.updatedAt),
  check("inventory_cost_nonnegative", sql`${table.cost} >= 0`),
  check("inventory_price_nonnegative", sql`${table.price} >= 0`),
  check("inventory_quantity_nonnegative", sql`${table.quantity} >= 0`),
]).enableRLS();

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),
  active: boolean("active").default(true).notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps,
}, (table) => [index("sources_org_idx").on(table.organizationId)]).enableRLS();

export const externalListings = pgTable("external_listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "cascade" }).notNull(),
  variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "cascade" }).notNull(),
  externalId: varchar("external_id", { length: 240 }).notNull(),
  url: text("url"),
  sellerName: varchar("seller_name", { length: 180 }),
  externalVariantId: varchar("external_variant_id", { length: 160 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("external_listing_source_id_uidx").on(table.sourceId, table.externalId), index("external_listing_variant_idx").on(table.variantId)]).enableRLS();

export const priceObservations = pgTable("price_observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  listingId: uuid("listing_id").references(() => externalListings.id, { onDelete: "cascade" }).notNull(),
  price: numeric("price", { precision: 14, scale: 2 }).notNull(),
  shippingPrice: numeric("shipping_price", { precision: 14, scale: 2 }).default("0").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  region: marketRegion("region").notNull(),
  type: priceType("type").default("reference").notNull(),
  condition: varchar("condition", { length: 40 }),
  finish: varchar("finish", { length: 40 }),
  referenceAt: timestamp("reference_at", { withTimezone: true }).notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  available: boolean("available").default(true).notNull(),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("price_observations_listing_time_idx").on(table.listingId, table.observedAt),
  index("price_observations_market_lookup_idx").on(table.listingId, table.currency, table.region, table.available),
  index("price_observations_currency_region_idx").on(table.currency, table.region, table.available, table.referenceAt.desc().nullsFirst()),
  uniqueIndex("price_observations_fingerprint_uidx").on(table.fingerprint),
  check("price_observation_nonnegative", sql`${table.price} >= 0`),
]).enableRLS();

export const pricingPolicies = pgTable("pricing_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  feePercent: numeric("fee_percent", { precision: 7, scale: 4 }).default("12").notNull(),
  additionalCostPercent: numeric("additional_cost_percent", { precision: 7, scale: 4 }).default("0").notNull(),
  minimumMarginPercent: numeric("minimum_margin_percent", { precision: 7, scale: 4 }).default("15").notNull(),
  desiredMarginPercent: numeric("desired_margin_percent", { precision: 7, scale: 4 }).default("25").notNull(),
  marketDiscountPercent: numeric("market_discount_percent", { precision: 7, scale: 4 }).default("2").notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (table) => [index("pricing_policies_org_idx").on(table.organizationId)]).enableRLS();

export const pricingRules = pgTable("pricing_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  channel: priceChannel("channel").default("counter").notNull(),
  category: varchar("category", { length: 80 }),
  rarity: varchar("rarity", { length: 120 }),
  finish: varchar("finish", { length: 40 }),
  feePercent: numeric("fee_percent", { precision: 7, scale: 4 }).default("12").notNull(),
  additionalCostPercent: numeric("additional_cost_percent", { precision: 7, scale: 4 }).default("0").notNull(),
  minimumMarginPercent: numeric("minimum_margin_percent", { precision: 7, scale: 4 }).default("20").notNull(),
  desiredMarginPercent: numeric("desired_margin_percent", { precision: 7, scale: 4 }).default("25").notNull(),
  marketDiscountPercent: numeric("market_discount_percent", { precision: 7, scale: 4 }).default("3").notNull(),
  maxChangePercent: numeric("max_change_percent", { precision: 7, scale: 4 }).default("15").notNull(),
  roundingMode: priceRoundingMode("rounding_mode").default("ends_90").notNull(),
  autoApplySafe: boolean("auto_apply_safe").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  priority: integer("priority").default(10).notNull(),
  ...timestamps,
}, (table) => [
  index("pricing_rules_org_idx").on(table.organizationId),
  index("pricing_rules_channel_idx").on(table.channel),
]).enableRLS();

export const recommendations = pgTable("recommendations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, { onDelete: "cascade" }).notNull(),
  ruleId: uuid("rule_id").references(() => pricingRules.id, { onDelete: "set null" }),
  channel: priceChannel("channel").default("counter").notNull(),
  suggestedPrice: numeric("suggested_price", { precision: 14, scale: 2 }).notNull(),
  minimumPrice: numeric("minimum_price", { precision: 14, scale: 2 }).notNull(),
  marketPrice: numeric("market_price", { precision: 14, scale: 2 }),
  safetyStatus: priceSafetyStatus("safety_status").default("safe_auto").notNull(),
  safetyFlag: text("safety_flag"),
  roundingMode: priceRoundingMode("rounding_mode").default("ends_90").notNull(),
  inputHash: varchar("input_hash", { length: 64 }),
  explanation: jsonb("explanation").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("recommendations_org_item_idx").on(table.organizationId, table.inventoryItemId, table.createdAt),
  index("recommendations_input_hash_idx").on(table.inputHash),
  index("recommendations_safety_idx").on(table.organizationId, table.safetyStatus),
]).enableRLS();

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, { onDelete: "cascade" }),
  severity: alertSeverity("severity").default("info").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  message: text("message").notNull(),
  dedupeKey: varchar("dedupe_key", { length: 180 }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("alerts_org_unread_idx").on(table.organizationId, table.readAt, table.createdAt),
    index("alerts_org_created_idx").on(table.organizationId, table.createdAt.desc().nullsFirst()),
  uniqueIndex("alerts_org_dedupe_uidx").on(table.organizationId, table.dedupeKey),
]).enableRLS();

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  status: importStatus("status").default("pending").notNull(),
  fileName: varchar("file_name", { length: 240 }).notNull(),
  fileHash: varchar("file_hash", { length: 64 }).notNull(),
  totalRows: integer("total_rows").default(0).notNull(),
  validRows: integer("valid_rows").default(0).notNull(),
  invalidRows: integer("invalid_rows").default(0).notNull(),
  errors: jsonb("errors").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [uniqueIndex("import_org_hash_uidx").on(table.organizationId, table.fileHash), index("import_org_created_idx").on(table.organizationId, table.createdAt)]).enableRLS();

export const softwareProducts = pgTable("software_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 40 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  tagline: varchar("tagline", { length: 220 }).default("").notNull(),
  description: text("description").default("").notNull(),
  icon: varchar("icon", { length: 40 }).default("sparkles").notNull(),
  accent: varchar("accent", { length: 20 }).default("violet").notNull(),
  appPath: varchar("app_path", { length: 160 }).default("/dashboard").notNull(),
  marketingFeatures: jsonb("marketing_features").$type<string[]>().default([]).notNull(),
  active: boolean("active").default(false).notNull(),
  featured: boolean("featured").default(false).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("software_products_code_uidx").on(table.code),
  uniqueIndex("software_products_slug_uidx").on(table.slug),
  index("software_products_active_order_idx").on(table.active, table.displayOrder),
]).enableRLS();

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  softwareProductId: uuid("software_product_id").references(() => softwareProducts.id, { onDelete: "restrict" }).notNull(),
  plan: varchar("plan", { length: 40 }).default("starter").notNull(),
  planId: uuid("plan_id").references(() => billingPlans.id, { onDelete: "set null" }),
  interval: billingInterval("interval").default("monthly").notNull(),
  status: subscriptionStatus("status").default("trialing").notNull(),
  externalCustomerId: varchar("external_customer_id", { length: 180 }),
  externalSubscriptionId: varchar("external_subscription_id", { length: 180 }),
  checkoutPlanId: uuid("checkout_plan_id").references(() => billingPlans.id, { onDelete: "set null" }),
  checkoutIdempotencyKey: varchar("checkout_idempotency_key", { length: 120 }),
  checkoutUrl: text("checkout_url"),
  checkoutPrice: numeric("checkout_price", { precision: 12, scale: 2 }),
  productLimit: integer("product_limit").default(500).notNull(),
  memberLimit: integer("member_limit").default(1).notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }),
  graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  scheduledCancellationAt: timestamp("scheduled_cancellation_at", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("subscriptions_org_product_uidx").on(table.organizationId, table.softwareProductId),
  uniqueIndex("subscriptions_external_uidx").on(table.externalSubscriptionId),
  index("subscriptions_status_idx").on(table.status, table.graceEndsAt),
]).enableRLS();

export const billingPlans = pgTable("billing_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  softwareProductId: uuid("software_product_id").references(() => softwareProducts.id, { onDelete: "cascade" }).notNull(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }).default("").notNull(),
  monthlyPrice: numeric("monthly_price", { precision: 12, scale: 2 }),
  yearlyPrice: numeric("yearly_price", { precision: 12, scale: 2 }),
  productLimit: integer("product_limit").notNull(),
  memberLimit: integer("member_limit").default(1).notNull(),
  trialDays: integer("trial_days").default(14).notNull(),
  gracePeriodDays: integer("grace_period_days").default(5).notNull(),
  features: jsonb("features").$type<string[]>().default([]).notNull(),
  active: boolean("active").default(false).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("billing_plans_product_code_uidx").on(table.softwareProductId, table.code),
  index("billing_plans_active_order_idx").on(table.softwareProductId, table.active, table.displayOrder),
]).enableRLS();

export const subscriptionPayments = pgTable("subscription_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "cascade" }).notNull(),
  externalInvoiceId: varchar("external_invoice_id", { length: 180 }),
  externalPaymentId: varchar("external_payment_id", { length: 180 }),
  status: paymentStatus("status").default("pending").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  providerStatus: varchar("provider_status", { length: 60 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("subscription_payments_invoice_uidx").on(table.externalInvoiceId),
  uniqueIndex("subscription_payments_payment_uidx").on(table.externalPaymentId),
  index("subscription_payments_subscription_idx").on(table.subscriptionId, table.createdAt),
  index("subscription_payments_status_idx").on(table.status, table.dueAt),
]).enableRLS();

export const coupons = pgTable("coupons", {
  id: uuid("id").defaultRandom().primaryKey(),
  softwareProductId: uuid("software_product_id").references(() => softwareProducts.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 40 }).notNull(),
  type: discountType("type").notNull(),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  durationMonths: integer("duration_months").default(1).notNull(),
  maxRedemptions: integer("max_redemptions"),
  redemptionCount: integer("redemption_count").default(0).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  active: boolean("active").default(false).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("coupons_code_uidx").on(sql`upper(${table.code})`),
  index("coupons_product_active_idx").on(table.softwareProductId, table.active),
]).enableRLS();

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "restrict" }).notNull(),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "cascade" }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull(),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("coupon_redemptions_coupon_subscription_uidx").on(table.couponId, table.subscriptionId),
  index("coupon_redemptions_subscription_idx").on(table.subscriptionId),
]).enableRLS();

export const teamInvitations = pgTable("team_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  invitedById: uuid("invited_by_id").references(() => users.id, { onDelete: "set null" }),
  email: varchar("email", { length: 254 }).notNull(),
  role: memberRole("role").default("member").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("team_invitations_token_uidx").on(table.tokenHash),
  index("team_invitations_org_email_idx").on(table.organizationId, table.email),
]).enableRLS();

export const billingWebhookEvents = pgTable("billing_webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: varchar("event_id", { length: 180 }).notNull(),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  resourceId: varchar("resource_id", { length: 180 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("billing_webhook_events_event_uidx").on(table.eventId),
  index("billing_webhook_events_resource_idx").on(table.resourceId),
]).enableRLS();

export const integrationConnections = pgTable("integration_connections", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull(), name: varchar("name", { length: 160 }).notNull(), mode: varchar("mode", { length: 20 }).default("read_only").notNull(),
  encryptedCredentials: text("encrypted_credentials").notNull(), active: boolean("active").default(false).notNull(), lastCursor: text("last_cursor"), lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }), ...timestamps,
}, (table) => [uniqueIndex("integration_org_kind_name_uidx").on(table.organizationId, table.kind, table.name), index("integration_org_idx").on(table.organizationId)]).enableRLS();

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(), connectionId: uuid("connection_id").references(() => integrationConnections.id, { onDelete: "cascade" }).notNull(),
  status: syncStatus("status").default("running").notNull(), source: varchar("source", { length: 40 }).notNull(), cursorBefore: text("cursor_before"), cursorAfter: text("cursor_after"), createdCount: integer("created_count").default(0).notNull(), updatedCount: integer("updated_count").default(0).notNull(), skippedCount: integer("skipped_count").default(0).notNull(), conflictCount: integer("conflict_count").default(0).notNull(), errorCount: integer("error_count").default(0).notNull(), errors: jsonb("errors").$type<Array<Record<string, unknown>>>().default([]).notNull(), startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(), completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("sync_runs_org_started_idx").on(table.organizationId, table.startedAt), index("sync_runs_connection_idx").on(table.connectionId)]).enableRLS();

export const commercePreviews = pgTable("commerce_previews", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  connectionId: uuid("connection_id").references(() => integrationConnections.id, { onDelete: "cascade" }).notNull(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  snapshot: jsonb("snapshot").$type<import("@/server/commerce/types").ReconciledItem[]>().notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  importRunId: uuid("import_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("commerce_previews_org_idx").on(table.organizationId, table.createdAt)]).enableRLS();

export const autopilotWorkerState = pgTable("autopilot_worker_state", {
  id: integer("id").primaryKey(),
  runId: uuid("run_id").defaultRandom().notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  channel: varchar("channel", { length: 20 }),
  lastItemId: uuid("last_item_id"),
  status: varchar("status", { length: 20 }).default("idle").notNull(),
  workerId: uuid("worker_id"),
  fencingVersion: integer("fencing_version").default(0).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  errorSummary: text("error_summary"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}).enableRLS();

export const externalProductMappings = pgTable("external_product_mappings", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(), connectionId: uuid("connection_id").notNull(), inventoryItemId: uuid("inventory_item_id").notNull(), externalId: varchar("external_id", { length: 180 }).notNull(), externalVariantId: varchar("external_variant_id", { length: 180 }), sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }), sourceVersion: varchar("source_version", { length: 180 }), lastImportedHash: varchar("last_imported_hash", { length: 64 }), ...timestamps,
}, (table) => [foreignKey({ name: "external_product_mappings_connection_id_integration_connections", columns: [table.connectionId], foreignColumns: [integrationConnections.id] }).onDelete("cascade"), foreignKey({ name: "external_product_mappings_inventory_item_id_inventory_items_id_", columns: [table.inventoryItemId], foreignColumns: [inventoryItems.id] }).onDelete("cascade"), uniqueIndex("external_mapping_connection_external_uidx").on(table.connectionId, table.externalId, table.externalVariantId), uniqueIndex("external_mapping_connection_inventory_uidx").on(table.connectionId, table.inventoryItemId), index("external_mapping_org_idx").on(table.organizationId)]).enableRLS();

export const priceChangeBatches = pgTable("price_change_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  idempotencyKey: varchar("idempotency_key", { length: 180 }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  source: varchar("source", { length: 40 }).default("manual_bulk_approve").notNull(),
  channel: priceChannel("channel").default("counter").notNull(),
  status: batchStatus("status").default("applied").notNull(),
  totalItems: integer("total_items").default(0).notNull(),
  totalValueBefore: numeric("total_value_before", { precision: 14, scale: 2 }).default("0").notNull(),
  totalValueAfter: numeric("total_value_after", { precision: 14, scale: 2 }).default("0").notNull(),
  revertedAt: timestamp("reverted_at", { withTimezone: true }),
  revertedById: uuid("reverted_by_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("price_batches_org_idempotency_uidx").on(table.organizationId, table.idempotencyKey),
  index("price_change_batches_org_idx").on(table.organizationId, table.createdAt),
]).enableRLS();

export const priceChangeHistory = pgTable("price_change_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  batchId: uuid("batch_id").notNull(),
  inventoryItemId: uuid("inventory_item_id").notNull(),
  previousPrice: numeric("previous_price", { precision: 14, scale: 2 }).notNull(),
  newPrice: numeric("new_price", { precision: 14, scale: 2 }).notNull(),
  suggestedPrice: numeric("suggested_price", { precision: 14, scale: 2 }).notNull(),
  minimumPrice: numeric("minimum_price", { precision: 14, scale: 2 }).notNull(),
  marginPercent: numeric("margin_percent", { precision: 7, scale: 4 }).notNull(),
  safetyStatus: priceSafetyStatus("safety_status").default("safe_auto").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: "price_change_logs_organization_id_organizations_id_fk", columns: [table.organizationId], foreignColumns: [organizations.id] }).onDelete("cascade"),
  foreignKey({ name: "price_change_logs_batch_id_price_change_batches_id_fk", columns: [table.batchId], foreignColumns: [priceChangeBatches.id] }).onDelete("cascade"),
  foreignKey({ name: "price_change_logs_inventory_item_id_inventory_items_id_fk", columns: [table.inventoryItemId], foreignColumns: [inventoryItems.id] }).onDelete("cascade"),
  index("price_change_history_batch_idx").on(table.batchId),
  index("price_change_history_item_idx").on(table.inventoryItemId),
  index("price_change_history_org_idx").on(table.organizationId, table.appliedAt),
]).enableRLS();

export const organizationRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships), inventoryItems: many(inventoryItems),
  subscriptions: many(subscriptions),
  pricingRules: many(pricingRules),
  priceBatches: many(priceChangeBatches),
}));
export const userRelations = relations(users, ({ many }) => ({ memberships: many(memberships) }));
export const membershipRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, { fields: [memberships.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));
export const productRelations = relations(products, ({ many }) => ({ variants: many(productVariants) }));
export const variantRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  inventoryItems: many(inventoryItems), listings: many(externalListings),
}));
export const inventoryRelations = relations(inventoryItems, ({ one, many }) => ({
  organization: one(organizations, { fields: [inventoryItems.organizationId], references: [organizations.id] }),
  variant: one(productVariants, { fields: [inventoryItems.variantId], references: [productVariants.id] }),
  recommendations: many(recommendations), alerts: many(alerts),
  priceHistory: many(priceChangeHistory),
  priceLogs: many(priceChangeHistory),
}));
export const pricingRuleRelations = relations(pricingRules, ({ one }) => ({
  organization: one(organizations, { fields: [pricingRules.organizationId], references: [organizations.id] }),
}));
export const priceChangeBatchRelations = relations(priceChangeBatches, ({ one, many }) => ({
  organization: one(organizations, { fields: [priceChangeBatches.organizationId], references: [organizations.id] }),
  createdByUser: one(users, { fields: [priceChangeBatches.createdById], references: [users.id] }),
  revertedByUser: one(users, { fields: [priceChangeBatches.revertedById], references: [users.id] }),
  logs: many(priceChangeHistory),
  history: many(priceChangeHistory),
}));
export const priceChangeHistoryRelations = relations(priceChangeHistory, ({ one }) => ({
  batch: one(priceChangeBatches, { fields: [priceChangeHistory.batchId], references: [priceChangeBatches.id] }),
  inventoryItem: one(inventoryItems, { fields: [priceChangeHistory.inventoryItemId], references: [inventoryItems.id] }),
}));
export const priceChangeLogRelations = priceChangeHistoryRelations;

// GeekPrice Index is a shared, platform-owned catalog. Merchant inventory remains
// isolated in its existing tables and is never populated by collection jobs.
export const indexCards = pgTable("index_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  game: varchar("game", { length: 16 }).notNull(),
  catalogSource: varchar("catalog_source", { length: 32 }).notNull(),
  canonicalId: varchar("canonical_id", { length: 180 }).notNull(),
  name: varchar("name", { length: 240 }).notNull(),
  setName: varchar("set_name", { length: 180 }).notNull(),
  setCode: varchar("set_code", { length: 40 }).notNull(),
  collectorNumber: varchar("collector_number", { length: 60 }).notNull(),
  imageUrl: text("image_url"),
  language: varchar("language", { length: 12 }),
  finish: varchar("finish", { length: 40 }),
  condition: varchar("condition", { length: 40 }),
  matchStatus: varchar("match_status", { length: 20 }).default("exact").notNull(),
  coverageStatus: varchar("coverage_status", { length: 20 }).default("unpriced").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("index_cards_identity_uidx").on(table.game, table.catalogSource, table.canonicalId),
  index("index_cards_lookup_idx").on(table.game, table.setCode, table.collectorNumber),
  index("index_cards_name_idx").on(table.game, table.name),
  check("index_cards_game_check", sql`${table.game} IN ('pokemon','magic')`),
  check("index_cards_match_check", sql`${table.matchStatus} IN ('exact','probable','ambiguous','not_found')`),
]).enableRLS();

export const indexSources = pgTable("index_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  baseUrl: text("base_url").notNull(),
  active: boolean("active").default(true).notNull(),
  commercialApproved: boolean("commercial_approved").default(false).notNull(),
  acquisitionMethod: varchar("acquisition_method", { length: 40 }),
  rightsReference: text("rights_reference"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  ...timestamps,
}).enableRLS();

export const indexImports = pgTable("index_imports", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").references(() => indexSources.id, { onDelete: "restrict" }).notNull(),
  fileHash: varchar("file_hash", { length: 64 }).notNull(),
  fileName: varchar("file_name", { length: 240 }).notNull(),
  acquisitionMethod: varchar("acquisition_method", { length: 40 }).notNull(),
  rightsReference: text("rights_reference").notNull(),
  sourceSnapshotAt: timestamp("source_snapshot_at", { withTimezone: true }).notNull(),
  totalRows: integer("total_rows").notNull(),
  validRows: integer("valid_rows").notNull(),
  pricedRows: integer("priced_rows").notNull(),
  unpricedRows: integer("unpriced_rows").notNull(),
  cursor: integer("cursor").default(0).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  errors: jsonb("errors").$type<Array<{ row: number; message: string }>>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("index_imports_source_file_uidx").on(table.sourceId, table.fileHash), index("index_imports_created_idx").on(table.createdAt)]).enableRLS();

export const indexInventoryLinks = pgTable("index_inventory_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, { onDelete: "cascade" }).notNull(),
  cardId: uuid("card_id").references(() => indexCards.id, { onDelete: "cascade" }).notNull(),
  matchStatus: varchar("match_status", { length: 20 }).notNull(),
  confirmedById: uuid("confirmed_by_id").references(() => users.id, { onDelete: "set null" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("index_inventory_links_item_uidx").on(table.organizationId, table.inventoryItemId), index("index_inventory_links_card_idx").on(table.cardId)]).enableRLS();

export const indexObservations = pgTable("index_observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => indexCards.id, { onDelete: "cascade" }).notNull(),
  sourceId: uuid("source_id").references(() => indexSources.id, { onDelete: "restrict" }).notNull(),
  sourceExternalId: varchar("source_external_id", { length: 180 }).notNull(),
  sourceUrl: text("source_url").notNull(),
  priceMin: numeric("price_min", { precision: 14, scale: 2 }).notNull(),
  providerAverage: numeric("provider_average", { precision: 14, scale: 2 }),
  priceMax: numeric("price_max", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
  priceType: varchar("price_type", { length: 24 }).default("asking_summary").notNull(),
  availableQuantity: integer("available_quantity"),
  language: varchar("language", { length: 12 }),
  finish: varchar("finish", { length: 40 }),
  condition: varchar("condition", { length: 40 }),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull().unique(),
}, (table) => [
  index("index_observations_card_date_idx").on(table.cardId, table.observedAt),
  index("index_observations_source_date_idx").on(table.sourceId, table.observedAt),
  check("index_observations_money_check", sql`${table.priceMin} > 0 AND ${table.priceMax} >= ${table.priceMin} AND (${table.providerAverage} IS NULL OR ${table.providerAverage} > 0)`),
  check("index_observations_brl_check", sql`${table.currency} = 'BRL'`),
]).enableRLS();

export const indexRuns = pgTable("index_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").references(() => indexSources.id, { onDelete: "restrict" }).notNull(),
  status: varchar("status", { length: 20 }).default("running").notNull(),
  cursor: integer("cursor").default(0).notNull(),
  searched: integer("searched").default(0).notNull(),
  priced: integer("priced").default(0).notNull(),
  errors: integer("errors").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  lastError: text("last_error"),
}, (table) => [index("index_runs_source_started_idx").on(table.sourceId, table.startedAt)]).enableRLS();
