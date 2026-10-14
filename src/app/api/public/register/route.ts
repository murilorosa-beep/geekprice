import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getPublicBaseUrl, isEmailDeliveryConfigured, sendTransactionalEmail } from "@/server/auth/email";
import { getApprovedLegalVersions } from "@/server/auth/legal";
import { assertPublicActionAllowed, PublicActionRateLimitError } from "@/server/auth/public-rate-limit";
import { registerOrganization } from "@/server/auth/registration";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  storeName: z.string().trim().min(2).max(160),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
});

export async function POST(request: Request) {
  try {
    await assertPublicActionAllowed(request, "register", 6, 60 * 60 * 1000);
    if (!isEmailDeliveryConfigured()) {
      return Response.json({ error: "O cadastro está indisponível até que o envio de e-mail seja configurado." }, { status: 503 });
    }
    const legalVersions = getApprovedLegalVersions();
    if (!legalVersions) {
      return Response.json({ error: "O cadastro público aguarda a aprovação jurídica dos Termos de Uso e da Política de Privacidade." }, { status: 503 });
    }
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "Corpo JSON inválido." }, { status: 400 }); }
    const parsed = registrationSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Confira os dados e aceite os termos e a política de privacidade." }, { status: 400 });
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (existing.length) return Response.json({ message: "Se o e-mail puder ser cadastrado, enviaremos instruções para continuar." }, { status: 202 });

    const result = await registerOrganization({ ...parsed.data, ...legalVersions });
    const verificationUrl = new URL("/verify-email", getPublicBaseUrl());
    verificationUrl.searchParams.set("token", result.verificationToken);
    await sendTransactionalEmail({
      to: result.email,
      subject: "Confirme seu e-mail — GeekPrice",
      text: `Olá, ${parsed.data.name}!\n\nConfirme seu e-mail acessando: ${verificationUrl.toString()}\n\nO link expira em 24 horas. Se você não criou esta conta, ignore esta mensagem.`,
    });
    return Response.json({ message: "Conta criada. Confira seu e-mail para confirmar o endereço e continuar." }, { status: 201 });
  } catch (error) {
    if (error instanceof PublicActionRateLimitError) return Response.json({ error: error.message }, { status: 429 });
    console.error("Falha no cadastro público.", error);
    return Response.json({ error: "Não foi possível concluir o cadastro. Tente novamente ou contate o suporte." }, { status: 500 });
  }
}
