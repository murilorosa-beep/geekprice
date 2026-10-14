import { VerifyEmailForm } from "@/components/commercial-auth-forms";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="login-page"><VerifyEmailForm token={token}/></main>;
}
