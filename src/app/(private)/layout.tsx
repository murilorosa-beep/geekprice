import { PrivateShell } from "@/components/private-shell";
import { redirect } from "next/navigation";
import { getPrivatePageContext } from "@/server/page-context";
export default async function PrivateLayout({children}:{children:React.ReactNode}){const actor=await getPrivatePageContext(true);if(!actor.onboardingCompleted)redirect("/onboarding");return <PrivateShell userName={actor.name} organizationName={actor.organizationName} role={actor.role}>{children}</PrivateShell>}
