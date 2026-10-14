import { z } from "zod";
import { hashPassword } from "@/server/auth/password";
import { assertPublicActionAllowed, PublicActionRateLimitError } from "@/server/auth/public-rate-limit";
import { resetPasswordWithActionToken } from "@/server/auth/tokens";

const schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(12).max(128) });

export async function POST(request: Request) {
  try {
    await assertPublicActionAllowed(request, "reset_password", 5, 60 * 60 * 1000);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Link inválido ou expirado. A senha precisa ter ao menos 12 caracteres." }, { status: 400 });
    const passwordHash = await hashPassword(parsed.data.password);
    if (!await resetPasswordWithActionToken(parsed.data.token, passwordHash)) return Response.json({ error: "Link de redefinição inválido ou expirado." }, { status: 400 });
    return Response.json({ message: "Senha alterada. Entre com a nova senha." });
  } catch (error) {
    if (error instanceof PublicActionRateLimitError) return Response.json({ error: error.message }, { status: 429 });
    console.error("Falha ao redefinir senha.", error);
    return Response.json({ error: "Não foi possível alterar a senha." }, { status: 500 });
  }
}
