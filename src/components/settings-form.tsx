"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Organization = { name: string; tradeName: string | null; currency: string };
type Policy = { name: string; feePercent: number; additionalCostPercent: number; minimumMarginPercent: number; desiredMarginPercent: number; marketDiscountPercent: number };

export function SettingsForm({ organization, policy, mode }: { organization: Organization; policy: Policy; mode: "store" | "pricing" }) {
  const router = useRouter();
  const [org, setOrg] = useState({ name: organization.name, tradeName: organization.tradeName ?? "", currency: "BRL" });
  const [pricing, setPricing] = useState({ ...policy });
  const [error, setError] = useState(""); const [feedback, setFeedback] = useState(""); const [saving, setSaving] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setFeedback("");
    const response = await fetch(mode === "store" ? "/api/organization" : "/api/pricing-policy", { method: mode === "store" ? "PATCH" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "store" ? org : pricing) });
    const body = await response.json(); setSaving(false);
    if (response.status === 401) { router.push("/login"); return; }
    if (!response.ok) return setError(body.details ? Object.values(body.details).flat().join(" ") : body.error ?? "Não foi possível salvar.");
    setFeedback("Configurações salvas e persistidas."); router.refresh();
  }
  return <div className="page-content"><div className="page-title"><div><p className="eyebrow">{mode === "store" ? "IDENTIDADE DA ORGANIZAÇÃO" : "POLÍTICA DE PREÇOS"}</p><h1>{mode === "store" ? "Minha loja" : "Configurações"}</h1><p>{mode === "store" ? "Dados comerciais usados em todo o espaço da loja." : "Parâmetros aplicados às recomendações e aos indicadores."}</p></div></div>
    <form className="panel settings-card" onSubmit={save}><h2>{mode === "store" ? "Informações da loja" : "Precificação padrão"}</h2><p>{mode === "store" ? "Somente administradores e proprietários podem alterar estes dados." : "A soma de taxas, custos e margem mínima deve permanecer abaixo de 100%."}</p>
      {error && <div className="form-error">{error}</div>}{feedback && <div className="feedback">{feedback}</div>}
      {mode === "store" ? <div className="form-grid"><label className="field">Nome da organização<input required minLength={2} value={org.name} onChange={(e) => setOrg({...org,name:e.target.value})}/></label><label className="field">Nome comercial<input value={org.tradeName} onChange={(e) => setOrg({...org,tradeName:e.target.value})}/></label><label className="field">Moeda padrão<select value={org.currency} onChange={(e) => setOrg({...org,currency:e.target.value})}><option value="BRL">BRL — Real brasileiro</option></select></label></div> : <div className="form-grid"><label className="field wide">Nome da política<input required value={pricing.name} onChange={(e) => setPricing({...pricing,name:e.target.value})}/></label><Percent label="Taxas de marketplace" value={pricing.feePercent} onChange={(feePercent) => setPricing({...pricing,feePercent})}/><Percent label="Custos percentuais adicionais" value={pricing.additionalCostPercent} onChange={(additionalCostPercent) => setPricing({...pricing,additionalCostPercent})}/><Percent label="Margem mínima padrão" value={pricing.minimumMarginPercent} onChange={(minimumMarginPercent) => setPricing({...pricing,minimumMarginPercent})}/><Percent label="Margem desejada" value={pricing.desiredMarginPercent} onChange={(desiredMarginPercent) => setPricing({...pricing,desiredMarginPercent})}/><Percent label="Desconto sobre mercado" value={pricing.marketDiscountPercent} onChange={(marketDiscountPercent) => setPricing({...pricing,marketDiscountPercent})}/></div>}
      <div className="form-actions"><button className="primary" disabled={saving}>{saving ? "Salvando..." : "Salvar configurações"}</button></div>
    </form></div>;
}
function Percent({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="field">{label} (%)<input type="number" min="0" max="99" step="0.01" required value={value} onChange={(e) => onChange(Number(e.target.value))}/></label>; }
