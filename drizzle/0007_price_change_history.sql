ALTER TYPE "public"."price_safety_status" ADD VALUE IF NOT EXISTS 'suspicious_flagged';--> statement-breakpoint
ALTER TABLE "price_change_logs" RENAME TO "price_change_history";--> statement-breakpoint
ALTER INDEX "price_change_logs_batch_idx" RENAME TO "price_change_history_batch_idx";--> statement-breakpoint
ALTER INDEX "price_change_logs_item_idx" RENAME TO "price_change_history_item_idx";--> statement-breakpoint
ALTER INDEX "price_change_logs_org_idx" RENAME TO "price_change_history_org_idx";
