CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'approved', 'rejected', 'refunded', 'chargeback', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TABLE "software_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"tagline" varchar(220) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" varchar(40) DEFAULT 'sparkles' NOT NULL,
	"accent" varchar(20) DEFAULT 'violet' NOT NULL,
	"app_path" varchar(160) DEFAULT '/dashboard' NOT NULL,
	"marketing_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "software_products_code_uidx" ON "software_products" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "software_products_slug_uidx" ON "software_products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "software_products_active_order_idx" ON "software_products" USING btree ("active","display_order");--> statement-breakpoint
INSERT INTO "software_products" ("code", "slug", "name", "tagline", "description", "icon", "accent", "app_path", "marketing_features", "active", "featured", "display_order")
VALUES ('geekprice', 'geekprice', 'GeekPrice', 'Inteligência de preços para lojas geek', 'Centralize catálogo, estoque, referências de mercado e recomendações de preço para cards e colecionáveis.', 'scan-search', 'violet', '/dashboard', '["Catálogo inteligente de cards", "Monitoramento de mercado", "Recomendações de preço", "Alertas e automações"]'::jsonb, true, true, 10)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
DROP INDEX IF EXISTS "subscriptions_org_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "billing_plans_code_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "billing_plans_active_order_idx";--> statement-breakpoint
ALTER TABLE "billing_plans" ADD COLUMN "software_product_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_plans" ADD COLUMN "yearly_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "billing_plans" ADD COLUMN "trial_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_plans" ADD COLUMN "grace_period_days" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_plans" ADD COLUMN "features" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "software_product_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "interval" "billing_interval" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "checkout_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "grace_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "scheduled_cancellation_at" timestamp with time zone;--> statement-breakpoint
UPDATE "billing_plans" SET "software_product_id" = (SELECT "id" FROM "software_products" WHERE "code" = 'geekprice');--> statement-breakpoint
UPDATE "subscriptions" SET "software_product_id" = (SELECT "id" FROM "software_products" WHERE "code" = 'geekprice');--> statement-breakpoint
ALTER TABLE "billing_plans" ALTER COLUMN "software_product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "software_product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_plans" ADD CONSTRAINT "billing_plans_software_product_id_software_products_id_fk" FOREIGN KEY ("software_product_id") REFERENCES "public"."software_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_software_product_id_software_products_id_fk" FOREIGN KEY ("software_product_id") REFERENCES "public"."software_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_plans_product_code_uidx" ON "billing_plans" USING btree ("software_product_id","code");--> statement-breakpoint
CREATE INDEX "billing_plans_active_order_idx" ON "billing_plans" USING btree ("software_product_id","active","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_org_product_uidx" ON "subscriptions" USING btree ("organization_id","software_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_external_uidx" ON "subscriptions" USING btree ("external_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status","grace_ends_at");--> statement-breakpoint
INSERT INTO "billing_plans" ("software_product_id", "code", "name", "description", "monthly_price", "yearly_price", "product_limit", "member_limit", "trial_days", "grace_period_days", "features", "active", "display_order")
SELECT "id", 'essential', 'Essencial', 'Para organizar o catálogo e começar a precificar com dados.', NULL, NULL, 500, 2, 14, 5, '["Catálogo e estoque", "Consulta de Magic e Pokémon", "Alertas de variação", "Até 2 usuários"]'::jsonb, true, 10 FROM "software_products" WHERE "code" = 'geekprice'
ON CONFLICT ("software_product_id", "code") DO NOTHING;--> statement-breakpoint
INSERT INTO "billing_plans" ("software_product_id", "code", "name", "description", "monthly_price", "yearly_price", "product_limit", "member_limit", "trial_days", "grace_period_days", "features", "active", "display_order")
SELECT "id", 'professional', 'Profissional', 'Automação de preço e operação para lojas em crescimento.', NULL, NULL, 5000, 8, 14, 5, '["Tudo do Essencial", "Recomendações automáticas", "Regras por canal", "Integrações comerciais", "Até 8 usuários"]'::jsonb, true, 20 FROM "software_products" WHERE "code" = 'geekprice'
ON CONFLICT ("software_product_id", "code") DO NOTHING;--> statement-breakpoint
INSERT INTO "billing_plans" ("software_product_id", "code", "name", "description", "monthly_price", "yearly_price", "product_limit", "member_limit", "trial_days", "grace_period_days", "features", "active", "display_order")
SELECT "id", 'scale', 'Escala', 'Controles avançados e maior capacidade para operações maduras.', NULL, NULL, 50000, 30, 14, 7, '["Tudo do Profissional", "Autopilot de preços", "Histórico e auditoria", "Suporte prioritário", "Até 30 usuários"]'::jsonb, true, 30 FROM "software_products" WHERE "code" = 'geekprice'
ON CONFLICT ("software_product_id", "code") DO NOTHING;--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"external_invoice_id" varchar(180),
	"external_payment_id" varchar(180),
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"provider_status" varchar(60),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_invoice_uidx" ON "subscription_payments" USING btree ("external_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_payment_uidx" ON "subscription_payments" USING btree ("external_payment_id");--> statement-breakpoint
CREATE INDEX "subscription_payments_subscription_idx" ON "subscription_payments" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments" USING btree ("status","due_at");--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"software_product_id" uuid,
	"code" varchar(40) NOT NULL,
	"type" "discount_type" NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"duration_months" integer DEFAULT 1 NOT NULL,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_software_product_id_software_products_id_fk" FOREIGN KEY ("software_product_id") REFERENCES "public"."software_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_uidx" ON "coupons" USING btree (upper("code"));--> statement-breakpoint
CREATE INDEX "coupons_product_active_idx" ON "coupons" USING btree ("software_product_id","active");--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"discount_amount" numeric(12, 2) NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_coupon_subscription_uidx" ON "coupon_redemptions" USING btree ("coupon_id","subscription_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_subscription_idx" ON "coupon_redemptions" USING btree ("subscription_id");
