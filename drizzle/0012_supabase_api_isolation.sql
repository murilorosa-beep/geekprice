-- GeekPrice uses server-side NextAuth/Drizzle authorization. Supabase API roles
-- must not read private tables directly, bypassing organization checks.
DO $$
DECLARE
  app_table text;
  api_role text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY['organizations', 'users', 'auth_action_tokens', 'legal_acceptances', 'login_attempts', 'public_action_limits', 'memberships', 'products', 'product_variants', 'inventory_items', 'sources', 'external_listings', 'price_observations', 'pricing_policies', 'pricing_rules', 'recommendations', 'alerts', 'import_jobs', 'software_products', 'subscriptions', 'billing_plans', 'subscription_payments', 'coupons', 'coupon_redemptions', 'team_invitations', 'billing_webhook_events', 'integration_connections', 'sync_runs', 'external_product_mappings', 'price_change_batches', 'price_change_history']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', app_table, api_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;
