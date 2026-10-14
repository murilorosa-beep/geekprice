import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getPublicBaseUrl, isEmailDeliveryConfigured, sendTransactionalEmail } from "@/server/auth/email";
import { assertPublicActionAllowed, PublicActionRateLimitError } from "@/server/auth/public-rate-limit";
import { createAuthActionToken } from "@/server/auth/tokens";

const schema = z.object({ email: z.email().max(254).transform((value) => value.toLowerCase()) });
const genericMessage = "Se a conta existir e ainda não estiver confirmada, enviaremos um novo link.";

export async function POST(request: Request) {
  try {
    if (!isEmailDeliveryConfigured()) return Response.json({ error: "Envio de e-mail indisponível. Configure o Resend." }, { status: 503 });
    await assertPublicActionAllowed(request, "resend_verification", 5, 60 * 60 * 1000);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ message: genericMessage });
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (user && !user.emailVerifiedAt) {
      const token = await createAuthActionToken(user.id, "verify_email", 24 * 60 * 60 * 1000);
      const url = new URL("/verify-email", getPublicBaseUrl());
      url.searchParams.set("token", token);
      await sendTransactionalEmail({
        to: user.email,
        subject: "Confirme seu e-mail — GeekPrice",
        text: `Olá, ${user.name}!\n\nConfirme seu e-mail acessando: ${url.toString()}\n\nO link expira em 24 horas.`,
      });
    }
    return Response.json({ message: genericMessage });
  } catch (error) {
    if (error instanceof PublicActionRateLimitError) return Response.json({ error: error.message }, { status: 429 });
    console.error("Falha ao reenviar confirmação de e-mail.", error);
    return Response.json({ error: "Não foi possível enviar a mensagem." }, { status: 503 });
  }
}
