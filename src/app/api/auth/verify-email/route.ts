import { z } from "zod";
import { assertPublicActionAllowed, PublicActionRateLimitError } from "@/server/auth/public-rate-limit";
import { verifyEmailActionToken } from "@/server/auth/tokens";

const schema = z.object({ token: z.string().min(20).max(200) });

export async function POST(request: Request) {
  try {
    await assertPublicActionAllowed(request, "verify_email", 20, 60 * 60 * 1000);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Link de confirmação inválido ou expirado." }, { status: 400 });
    if (!await verifyEmailActionToken(parsed.data.token)) return Response.json({ error: "Link de confirmação inválido ou expirado." }, { status: 400 });
    return Response.json({ message: "E-mail confirmado. Você já pode entrar na sua conta." });
  } catch (error) {
    if (error instanceof PublicActionRateLimitError) return Response.json({ error: error.message }, { status: 429 });
    console.error("Falha ao confirmar e-mail.", error);
    return Response.json({ error: "Não foi possível confirmar o e-mail." }, { status: 500 });
  }
}
