import { BillingPlanAdmin } from "@/components/billing-plan-admin";
import { requireBillingAdministrator } from "@/server/billing/admin";

export default async function PlatformPlansPage() {
  if (!await requireBillingAdministrator()) {
    return <main className="legal-page"><div className="legal-card"><h1>Acesso restrito</h1><p>Esta área é exclusiva para administradores da plataforma configurados em BILLING_ADMIN_EMAILS.</p></div></main>;
  }
  return <BillingPlanAdmin/>;
}
