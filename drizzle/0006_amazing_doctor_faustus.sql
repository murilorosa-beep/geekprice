CREATE TYPE "public"."batch_status" AS ENUM('applied', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."price_channel" AS ENUM('counter', 'ecommerce', 'marketplace');--> statement-breakpoint
CREATE TYPE "public"."price_rounding_mode" AS ENUM('none', 'ends_90', 'ends_99', 'round_integer');--> statement-breakpoint
CREATE TYPE "public"."price_safety_status" AS ENUM('safe_auto', 'flagged_spike', 'flagged_margin_risk', 'flagged_no_market', 'unchanged');--> statement-breakpoint
CREATE TABLE "price_change_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_id" uuid,
	"source" varchar(40) DEFAULT 'manual_bulk_approve' NOT NULL,
	"channel" "price_channel" DEFAULT 'counter' NOT NULL,
	"status" "batch_status" DEFAULT 'applied' NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"total_value_before" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_value_after" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reverted_at" timestamp with time zone,
	"reverted_by_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_change_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"previous_price" numeric(14, 2) NOT NULL,
	"new_price" numeric(14, 2) NOT NULL,
	"suggested_price" numeric(14, 2) NOT NULL,
	"minimum_price" numeric(14, 2) NOT NULL,
	"margin_percent" numeric(7, 4) NOT NULL,
	"safety_status" "price_safety_status" DEFAULT 'safe_auto' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"channel" "price_channel" DEFAULT 'counter' NOT NULL,
	"category" varchar(80),
	"rarity" varchar(120),
	"finish" varchar(40),
	"fee_percent" numeric(7, 4) DEFAULT '12' NOT NULL,
	"additional_cost_percent" numeric(7, 4) DEFAULT '0' NOT NULL,
	"minimum_margin_percent" numeric(7, 4) DEFAULT '20' NOT NULL,
	"desired_margin_percent" numeric(7, 4) DEFAULT '25' NOT NULL,
	"market_discount_percent" numeric(7, 4) DEFAULT '3' NOT NULL,
	"max_change_percent" numeric(7, 4) DEFAULT '15' NOT NULL,
	"rounding_mode" "price_rounding_mode" DEFAULT 'ends_90' NOT NULL,
	"auto_apply_safe" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "rule_id" uuid;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "channel" "price_channel" DEFAULT 'counter' NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "safety_status" "price_safety_status" DEFAULT 'safe_auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "safety_flag" text;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "rounding_mode" "price_rounding_mode" DEFAULT 'ends_90' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_change_batches" ADD CONSTRAINT "price_change_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_batches" ADD CONSTRAINT "price_change_batches_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_batches" ADD CONSTRAINT "price_change_batches_reverted_by_id_users_id_fk" FOREIGN KEY ("reverted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_batch_id_price_change_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."price_change_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_change_batches_org_idx" ON "price_change_batches" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "price_change_logs_batch_idx" ON "price_change_logs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "price_change_logs_item_idx" ON "price_change_logs" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "price_change_logs_org_idx" ON "price_change_logs" USING btree ("organization_id","applied_at");--> statement-breakpoint
CREATE INDEX "pricing_rules_org_idx" ON "pricing_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pricing_rules_channel_idx" ON "pricing_rules" USING btree ("channel");--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_rule_id_pricing_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."pricing_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendations_safety_idx" ON "recommendations" USING btree ("organization_id","safety_status");