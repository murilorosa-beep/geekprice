import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";
import { getPrivatePageContext } from "@/server/page-context";
import { getOrganizationSettings } from "@/server/settings/service";

export default async function OnboardingPage() {
  const actor = await getPrivatePageContext();
  if (actor.onboardingCompleted) redirect("/dashboard");
  const organization = await getOrganizationSettings(actor.organizationId);
  if (!organization) throw new Error("Organização não encontrada.");
  return <main className="login-page"><OnboardingForm initialName={organization.name} initialTradeName={organization.tradeName ?? ""}/></main>;
}
