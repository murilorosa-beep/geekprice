"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    const data = new FormData(event.currentTarget);
    const result = await signIn("credentials", { email: data.get("email"), password: data.get("password"), redirect: false });
    setLoading(false);
    if (result?.error) return setError(result.error.includes("LOGIN_RATE_LIMITED")
      ? "Muitas tentativas. Aguarde 15 minutos e tente novamente."
      : "E-mail ou senha inválidos.");
    window.location.href = "/dashboard";
  }

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><div className="brand-mark">G</div><span>GeekPrice</span></div>
    <p className="eyebrow">INTELIGÊNCIA DE PREÇOS</p><h1>Acesse sua loja</h1><p>Entre para acompanhar estoque, mercado e recomendações.</p>
    <label>E-mail ou Usuário<input name="email" type="text" autoComplete="username" required placeholder="murilo ou voce@loja.com.br" /></label>
    <label>Senha<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
    <div className="auth-links"><Link href="/forgot-password">Esqueci minha senha</Link> · <Link href="/resend-verification">Confirmar e-mail</Link></div>
    {error && <div className="form-error">{error}</div>}
    <button className="primary full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
    <p className="auth-switch">Ainda não tem conta? <Link href="/register">Cadastre sua loja</Link></p>
  </form>;
}
