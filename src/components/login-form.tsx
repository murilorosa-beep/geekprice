"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { ArrowUpRight, Layers, ShieldCheck, ChartNoAxesCombined } from "lucide-react";
import { GeekMark, TcgCardFan } from "./tcg-art";

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

  return <div className="tcg-login-layout"><aside className="tcg-login-story"><div className="login-brand"><GeekMark/><span>GeekPrice</span></div><span className="tcg-kicker">CRIADO PARA O SEU UNIVERSO</span><h2>Grandes coleções.<br/><span>Melhores decisões.</span></h2><p>O seu estoque tem histórias. Dê a cada carta a atenção que ela merece.</p><TcgCardFan/><div className="login-story-features"><span><Layers size={17}/> Sua coleção organizada</span><span><ChartNoAxesCombined size={17}/> Mercado em perspectiva</span><span><ShieldCheck size={17}/> Gestão da sua loja</span></div></aside><form className="login-card" onSubmit={submit}>
    <div className="login-brand"><GeekMark/><span>GeekPrice</span></div>
    <p className="eyebrow">INTELIGÊNCIA DE PREÇOS</p><h1>Acesse sua loja</h1><p>Entre para acompanhar estoque, mercado e recomendações.</p>
    <label>E-mail<input name="email" type="email" autoComplete="username" required placeholder="voce@loja.com.br" /></label>
    <label>Senha<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
    <div className="auth-links"><Link href="/forgot-password">Esqueci minha senha</Link> · <Link href="/resend-verification">Confirmar e-mail</Link></div>
    {error && <div className="form-error">{error}</div>}
    <button className="primary full" disabled={loading}>{loading ? "Entrando..." : <>Entrar na minha loja <ArrowUpRight size={18}/></>}</button>
    <p className="auth-switch">Ainda não tem conta? <Link href="/register">Cadastre sua loja</Link></p>
  </form></div>;
}
