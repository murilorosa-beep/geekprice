"use client";

import Link from "next/link";
import { useState } from "react";

async function submitJson(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { response, body };
}

export function RegisterForm({ registrationAvailable }: { registrationAvailable: boolean }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const { response, body } = await submitJson("/api/public/register", {
        name: data.get("name"),
        storeName: data.get("storeName"),
        email: data.get("email"),
        password: data.get("password"),
        termsAccepted: data.get("terms") === "on",
        privacyAccepted: data.get("privacy") === "on",
      });
      if (!response.ok) setError(body.error ?? "Não foi possível criar a conta.");
      else setMessage(body.message);
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><div className="brand-mark">G</div><span>GeekPrice</span></div>
    <p className="eyebrow">COMECE SEU TESTE</p><h1>Crie sua loja</h1>
    <p>Cadastre a loja e confirme seu e-mail para iniciar o período de teste.</p>
    {!registrationAvailable && <div className="draft-notice">O cadastro público está temporariamente desativado. Configure o envio de e-mail e conclua a revisão jurídica dos documentos antes de aceitar novos clientes.</div>}
    {error && <div className="form-error">{error}</div>}
    {message && <div className="feedback">{message}</div>}
    <label>Seu nome<input name="name" autoComplete="name" required minLength={2} maxLength={160}/></label>
    <label>Nome da loja<input name="storeName" autoComplete="organization" required minLength={2} maxLength={160}/></label>
    <label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
    <label>Senha<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label>
    <label className="check-field"><input name="terms" type="checkbox" required/> Li e aceito os <Link href="/terms">Termos de Uso</Link> (rascunho).</label>
    <label className="check-field"><input name="privacy" type="checkbox" required/> Li a <Link href="/privacy">Política de Privacidade</Link> (rascunho).</label>
    <button className="primary full" disabled={loading || !registrationAvailable}>{loading ? "Criando conta..." : "Criar conta"}</button>
    <p className="auth-switch">Já tem conta? <Link href="/login">Entrar</Link></p>
  </form>;
}

export function VerifyEmailForm({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function verify() {
    setLoading(true); setError(""); setMessage("");
    try {
      const { response, body } = await submitJson("/api/auth/verify-email", { token });
      if (!response.ok) setError(body.error ?? "O link expirou ou é inválido.");
      else setMessage(body.message);
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="login-card">
    <div className="login-brand"><div className="brand-mark">G</div><span>GeekPrice</span></div>
    <p className="eyebrow">CONFIRMAÇÃO DE E-MAIL</p><h1>Confirme seu endereço</h1>
    <p>Use o link recebido por e-mail para confirmar a conta.</p>
    {error && <div className="form-error">{error}</div>}{message && <div className="feedback">{message}</div>}
    <button className="primary full" disabled={loading || !token} onClick={verify}>{loading ? "Confirmando..." : "Confirmar e-mail"}</button>
    <p className="auth-switch"><Link href="/login">Ir para o login</Link></p>
  </div>;
}

export function EmailRequestForm({ purpose = "reset" }: { purpose?: "reset" | "verification" }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const endpoint = purpose === "verification" ? "/api/auth/resend-verification" : "/api/auth/forgot-password";
      const { response, body } = await submitJson(endpoint, { email: data.get("email") });
      if (!response.ok) setError(body.error ?? "Não foi possível enviar as instruções.");
      else setMessage(body.message);
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><div className="brand-mark">G</div><span>GeekPrice</span></div>
    <p className="eyebrow">{purpose === "verification" ? "CONFIRMAÇÃO DE E-MAIL" : "RECUPERAÇÃO DE ACESSO"}</p>
    <h1>{purpose === "verification" ? "Reenviar confirmação" : "Redefinir senha"}</h1>
    <p>{purpose === "verification" ? "Informe seu e-mail para receber outro link de confirmação." : "Informe seu e-mail. Se houver uma conta, enviaremos um link de redefinição."}</p>
    {error && <div className="form-error">{error}</div>}{message && <div className="feedback">{message}</div>}
    <label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
    <button className="primary full" disabled={loading}>{loading ? "Enviando..." : "Enviar instruções"}</button>
    <p className="auth-switch"><Link href="/login">Voltar ao login</Link></p>
  </form>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== data.get("confirmPassword")) {
      setError("As senhas não coincidem."); setLoading(false); return;
    }
    try {
      const { response, body } = await submitJson("/api/auth/reset-password", { token, password });
      if (!response.ok) setError(body.error ?? "Não foi possível redefinir a senha.");
      else setMessage(body.message);
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><div className="brand-mark">G</div><span>GeekPrice</span></div>
    <p className="eyebrow">RECUPERAÇÃO DE ACESSO</p><h1>Escolha uma nova senha</h1>
    {error && <div className="form-error">{error}</div>}{message && <div className="feedback">{message}</div>}
    <label>Nova senha<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label>
    <label>Confirme a senha<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label>
    <button className="primary full" disabled={loading || !token}>{loading ? "Salvando..." : "Redefinir senha"}</button>
    <p className="auth-switch"><Link href="/login">Voltar ao login</Link></p>
  </form>;
}
