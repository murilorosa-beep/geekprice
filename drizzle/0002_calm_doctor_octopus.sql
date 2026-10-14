ALTER TABLE "organizations" ADD COLUMN "trade_name" varchar(160);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "currency" varchar(3) DEFAULT 'BRL' NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_policies" ADD COLUMN "additional_cost_percent" numeric(7, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_policies" ADD COLUMN "minimum_margin_percent" numeric(7, 4) DEFAULT '15' NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "input_hash" varchar(64);--> statement-breakpoint
CREATE INDEX "recommendations_input_hash_idx" ON "recommendations" USING btree ("input_hash");