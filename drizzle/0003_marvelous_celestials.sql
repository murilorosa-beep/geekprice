CREATE TYPE "public"."market_region" AS ENUM('BR', 'international', 'converted');--> statement-breakpoint
CREATE TYPE "public"."price_type" AS ENUM('listing', 'completed_sale', 'reference');--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "dedupe_key" varchar(180);--> statement-breakpoint
ALTER TABLE "external_listings" ADD COLUMN "external_variant_id" varchar(160);--> statement-breakpoint
ALTER TABLE "external_listings" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "currency" varchar(3) NOT NULL;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "region" "market_region" NOT NULL;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "type" "price_type" DEFAULT 'reference' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "condition" varchar(40);--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "finish" varchar(40);--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "reference_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "fingerprint" varchar(64) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_org_dedupe_uidx" ON "alerts" USING btree ("organization_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "price_observations_fingerprint_uidx" ON "price_observations" USING btree ("fingerprint");