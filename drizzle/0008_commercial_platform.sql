ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = COALESCE("updated_at", now()) WHERE "email_verified_at" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "organizations" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"monthly_price" numeric(12, 2),
	"product_limit" integer NOT NULL,
	"member_limit" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "billing_plans_code_uidx" ON "billing_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "billing_plans_active_order_idx" ON "billing_plans" USING btree ("active","display_order");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "checkout_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "checkout_idempotency_key" varchar(120);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "member_limit" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_billing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_checkout_plan_id_billing_plans_id_fk" FOREIGN KEY ("checkout_plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "auth_action_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "auth_action_tokens" ADD CONSTRAINT "auth_action_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_action_tokens_hash_uidx" ON "auth_action_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_action_tokens_user_purpose_idx" ON "auth_action_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"document" varchar(32) NOT NULL,
	"version" varchar(40) NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_acceptances_org_user_idx" ON "legal_acceptances" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE TABLE "team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invited_by_id" uuid,
	"email" varchar(254) NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitations_token_uidx" ON "team_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "team_invitations_org_email_idx" ON "team_invitations" USING btree ("organization_id","email");--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(180) NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"resource_id" varchar(180) NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "billing_webhook_events_event_uidx" ON "billing_webhook_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "billing_webhook_events_resource_idx" ON "billing_webhook_events" USING btree ("resource_id");--> statement-breakpoint
CREATE TABLE "public_action_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" varchar(64) NOT NULL,
	"origin_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX "public_action_limits_action_origin_uidx" ON "public_action_limits" USING btree ("action","origin_hash");--> statement-breakpoint
CREATE INDEX "public_action_limits_locked_idx" ON "public_action_limits" USING btree ("locked_until");
