"use client";

import { useState } from "react";
import Link from "next/link";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const password = String(data.get("password") ?? "");
    try {
      const response = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          ...(name ? { name } : {}),
          ...(password ? { password } : {}),
          termsAccepted: data.get("terms") === "on",
          privacyAccepted: data.get("privacy") === "on",
        }),
      });
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Não foi possível aceitar o convite.");
      else setMessage(body.message);
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><div className="brand-mark">G</div><span>GeekPrice</span></div>
    <p className="eyebrow">CONVITE DE EQUIPE</p><h1>Aceite o convite</h1>
    <p>Se você ainda não tem conta, informe nome e crie uma senha. Se já tem conta, esses campos podem ficar vazios.</p>
    {error && <div className="form-error">{error}</div>}{message && <div className="feedback">{message}</div>}
    <label>Seu nome (novas contas)<input name="name" autoComplete="name" minLength={2} maxLength={160}/></label>
    <label>Senha (novas contas)<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128}/></label>
    <label className="check-field"><input name="terms" type="checkbox" required/> Li e aceito os <Link href="/terms">Termos de Uso</Link>.</label>
    <label className="check-field"><input name="privacy" type="checkbox" required/> Li a <Link href="/privacy">Política de Privacidade</Link>.</label>
    <button className="primary full" disabled={loading || !token}>{loading ? "Aceitando..." : "Aceitar convite"}</button>
    <p className="auth-switch"><Link href="/login">Ir para o login</Link></p>
  </form>;
}
