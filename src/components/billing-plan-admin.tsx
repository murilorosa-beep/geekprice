"use client";

import { useEffect, useState } from "react";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string;
  monthlyPrice: string | null;
  productLimit: number;
  memberLimit: number;
  active: boolean;
  displayOrder: number;
};
type Draft = Omit<Plan, "id">;
const emptyDraft: Draft = { code: "", name: "", description: "", monthlyPrice: null, productLimit: 500, memberLimit: 1, active: false, displayOrder: 0 };

export function BillingPlanAdmin() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/billing-plans");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar os planos.");
    setPlans(body);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/billing-plans", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar os planos.");
        setPlans(body);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha ao carregar planos.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  function edit(plan: Plan) {
    setEditingId(plan.id);
    setDraft({
      code: plan.code, name: plan.name, description: plan.description,
      monthlyPrice: plan.monthlyPrice, productLimit: plan.productLimit,
      memberLimit: plan.memberLimit, active: plan.active, displayOrder: plan.displayOrder,
    });
    setError(""); setMessage("");
  }

  function reset() {
    setEditingId(""); setDraft(emptyDraft);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(editingId ? `/api/admin/billing-plans/${editingId}` : "/api/admin/billing-plans", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, monthlyPrice: draft.monthlyPrice === null || draft.monthlyPrice === "" ? null : Number(draft.monthlyPrice) }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Não foi possível salvar o plano."); return; }
      setMessage("Plano salvo.");
      reset();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o plano.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(plan: Plan) {
    if (!window.confirm(`Excluir o plano ${plan.name}?`)) return;
    const response = await fetch(`/api/admin/billing-plans/${plan.id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Não foi possível excluir o plano.");
      return;
    }
    if (editingId === plan.id) reset();
    await refresh();
  }

  return <div className="page-content">
    <div className="page-title"><div><p className="eyebrow">ADMINISTRAÇÃO DA PLATAFORMA</p><h1>Catálogo de planos</h1><p>Configure preços e limites. Um preço vazio mantém o checkout bloqueado para aquele plano.</p></div></div>
    <div className="draft-notice">Esta tela só funciona para e-mails incluídos em BILLING_ADMIN_EMAILS. Defina valores e limites após validar a estratégia comercial.</div>
    {error && <div className="form-error">{error}</div>}{message && <div className="feedback">{message}</div>}
    <form className="panel plan-admin-form" onSubmit={save}>
      <h2>{editingId ? "Editar plano" : "Novo plano"}</h2>
      <div className="form-grid">
        <label className="field">Código único<input required pattern="[a-z0-9-]{2,40}" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toLowerCase() })}/></label>
        <label className="field">Nome público<input required minLength={2} maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label>
        <label className="field wide">Descrição<input maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/></label>
        <label className="field">Preço mensal (R$)<input type="number" min="0.01" step="0.01" placeholder="Vazio desativa o checkout" value={draft.monthlyPrice ?? ""} onChange={(event) => setDraft({ ...draft, monthlyPrice: event.target.value || null })}/></label>
        <label className="field">Limite de produtos<input type="number" min="1" max="1000000" required value={draft.productLimit} onChange={(event) => setDraft({ ...draft, productLimit: Number(event.target.value) })}/></label>
        <label className="field">Limite de pessoas<input type="number" min="1" max="10000" required value={draft.memberLimit} onChange={(event) => setDraft({ ...draft, memberLimit: Number(event.target.value) })}/></label>
        <label className="field">Ordem de exibição<input type="number" min="0" required value={draft.displayOrder} onChange={(event) => setDraft({ ...draft, displayOrder: Number(event.target.value) })}/></label>
        <label className="check-field"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })}/> Exibir aos clientes</label>
      </div>
      <div className="form-actions"><button className="primary" disabled={saving}>{saving ? "Salvando..." : "Salvar plano"}</button>{editingId && <button type="button" className="secondary" onClick={reset}>Cancelar edição</button>}</div>
    </form>
    <section className="panel team-panel"><h2>Planos cadastrados</h2>{loading ? <p>Carregando...</p> : plans.length === 0 ? <p>Nenhum plano configurado ainda.</p> : plans.map((plan) => <div className="team-row" key={plan.id}>
      <div><strong>{plan.name} <small>({plan.code})</small></strong><span>{plan.monthlyPrice === null ? "Preço não configurado" : `R$ ${Number(plan.monthlyPrice).toFixed(2)} / mês`} · {plan.productLimit} produtos · {plan.memberLimit} pessoas</span></div>
      <span className="role-badge">{plan.active ? plan.monthlyPrice ? "Publicado" : "Sem preço" : "Rascunho"}</span>
      <button className="secondary" onClick={() => edit(plan)}>Editar</button><button className="secondary" onClick={() => remove(plan)}>Excluir</button>
    </div>)}</section>
  </div>;
}
