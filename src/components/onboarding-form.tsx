"use client";

import { useState } from "react";

export function OnboardingForm({ initialName, initialTradeName }: { initialName: string; initialTradeName: string }) {
  const [name, setName] = useState(initialName);
  const [tradeName, setTradeName] = useState(initialTradeName);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tradeName, currency: "BRL" }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Não foi possível concluir a configuração."); return; }
      window.location.href = "/dashboard";
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><div className="brand-mark">G</div><span>GeekPrice</span></div>
    <p className="eyebrow">CONFIGURAÇÃO INICIAL</p><h1>Prepare sua loja</h1>
    <p>Confirme a identidade da organização. Você poderá ajustar as informações depois.</p>
    {error && <div className="form-error">{error}</div>}
    <label>Nome da organização<input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)}/></label>
    <label>Nome comercial (opcional)<input maxLength={160} value={tradeName} onChange={(event) => setTradeName(event.target.value)}/></label>
    <div className="feedback">Plano de teste configurado. Os planos pagos serão exibidos quando o catálogo comercial estiver pronto.</div>
    <button className="primary full" disabled={saving}>{saving ? "Salvando..." : "Concluir configuração"}</button>
  </form>;
}
