DROP INDEX IF EXISTS "product_variants_sku_uidx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_variants_sku_idx" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_observations_currency_region_idx" ON "price_observations" USING btree ("currency", "region", "available", "reference_at" DESC);
