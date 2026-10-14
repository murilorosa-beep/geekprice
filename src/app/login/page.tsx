import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { LoginForm } from "@/components/login-form";
import { authOptions } from "@/server/auth/options";
import { getOrganizationSessionContext } from "@/server/auth/context";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ switch?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  if (!params.switch) {
    let shouldRedirect = false;
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.id) {
        await getOrganizationSessionContext();
        shouldRedirect = true;
      }
    } catch {
      // Se a sessão expirou, foi revogada ou é inválida, permanece na tela de login
    }
    if (shouldRedirect) {
      redirect("/dashboard");
    }
  }

  return (
    <main className="login-page">
      <LoginForm />
    </main>
  );
}
