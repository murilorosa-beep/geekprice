CREATE INDEX IF NOT EXISTS "alerts_org_created_idx" ON "alerts" ("organization_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_observations_market_lookup_idx" ON "price_observations" ("listing_id", "currency", "region", "available");
