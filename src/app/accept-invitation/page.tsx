import { AcceptInvitationForm } from "@/components/accept-invitation-form";

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="login-page"><AcceptInvitationForm token={token}/></main>;
}
