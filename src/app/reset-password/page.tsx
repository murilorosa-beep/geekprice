import { ResetPasswordForm } from "@/components/commercial-auth-forms";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="login-page"><ResetPasswordForm token={token}/></main>;
}
