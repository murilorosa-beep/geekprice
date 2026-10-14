import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getPublicBaseUrl, isEmailDeliveryConfigured, sendTransactionalEmail } from "@/server/auth/email";
import { assertPublicActionAllowed, PublicActionRateLimitError } from "@/server/auth/public-rate-limit";
import { createAuthActionToken } from "@/server/auth/tokens";

const schema = z.object({ email: z.email().max(254).transform((value) => value.toLowerCase()) });
const genericMessage = "Se houver uma conta para esse e-mail, enviaremos instruções para redefinir a senha.";

export async function POST(request: Request) {
  try {
    if (!isEmailDeliveryConfigured()) return Response.json({ error: "Envio de e-mail indisponível. Configure o Resend." }, { status: 503 });
    await assertPublicActionAllowed(request, "forgot_password", 5, 60 * 60 * 1000);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ message: genericMessage });
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, active: users.active })
      .from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (user?.active) {
      const token = await createAuthActionToken(user.id, "reset_password", 60 * 60 * 1000);
      const url = new URL("/reset-password", getPublicBaseUrl());
      url.searchParams.set("token", token);
      await sendTransactionalEmail({
        to: user.email,
        subject: "Redefinição de senha — GeekPrice",
        text: `Olá, ${user.name}!\n\nRedefina sua senha acessando: ${url.toString()}\n\nO link expira em uma hora. Se você não solicitou a redefinição, ignore esta mensagem.`,
      });
    }
    return Response.json({ message: genericMessage });
  } catch (error) {
    if (error instanceof PublicActionRateLimitError) return Response.json({ error: error.message }, { status: 429 });
    console.error("Falha ao solicitar redefinição de senha.", error);
    return Response.json({ error: "Não foi possível enviar as instruções." }, { status: 503 });
  }
}
