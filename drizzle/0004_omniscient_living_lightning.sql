ALTER TABLE "inventory_items" ADD COLUMN "organization_sku" varchar(120);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "barcode" varchar(32);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "rarity" varchar(120);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "catalog_source" varchar(40);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "canonical_id" varchar(180);--> statement-breakpoint
UPDATE "inventory_items" AS i SET "organization_sku" = v."sku" FROM "product_variants" AS v WHERE i."variant_id" = v."id" AND i."organization_sku" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_org_sku_uidx" ON "inventory_items" USING btree ("organization_id","organization_sku");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_org_barcode_uidx" ON "inventory_items" USING btree ("organization_id","barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_catalog_uidx" ON "product_variants" USING btree ("catalog_source","canonical_id","language","condition","finish");
