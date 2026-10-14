"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string;
  monthlyPrice: string | null;
  productLimit: number;
  memberLimit: number;
  checkoutAvailable: boolean;
};
type Subscription = {
  plan: string;
  productLimit: number;
  memberLimit: number;
  status: string;
  trialEndsAt: string | null;
  periodEndsAt: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
};

const money = (value: string | null) => value === null
  ? "Preço a definir"
  : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const statusLabels: Record<string, string> = {
  trialing: "Em período de teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
};

export function BillingManager({ plans, subscription, productCount, memberCount, canManage, paymentReady }: {
  plans: Plan[];
  subscription: Subscription | null;
  productCount: number;
  memberCount: number;
  canManage: boolean;
  paymentReady: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busyPlan, setBusyPlan] = useState("");
  const [canceling, setCanceling] = useState(false);

  async function choosePlan(planId: string) {
    setBusyPlan(planId); setError(""); setFeedback("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Não foi possível atualizar o plano."); return; }
      if (body.checkoutUrl) { window.location.assign(body.checkoutUrl); return; }
      setFeedback(body.message ?? "Plano atualizado.");
      router.refresh();
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setBusyPlan("");
    }
  }

  async function cancelSubscription() {
    if (!window.confirm("Cancelar a assinatura? O acesso pago será encerrado imediatamente.")) return;
    setCanceling(true); setError(""); setFeedback("");
    try {
      const response = await fetch("/api/billing/cancel", { method: "POST" });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Não foi possível cancelar a assinatura."); return; }
      setFeedback(body.message);
      router.refresh();
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setCanceling(false);
    }
  }

  const status = subscription?.status ?? "trialing";
  const selectedPlan = plans.find((plan) => plan.code === subscription?.plan);
  const productLimit = selectedPlan?.productLimit ?? subscription?.productLimit ?? 500;
  const memberLimit = selectedPlan?.memberLimit ?? subscription?.memberLimit ?? 1;

  return <div className="page-content">
    <div className="page-title"><div><p className="eyebrow">CONTA E ASSINATURA</p><h1>Plano e consumo</h1><p>Consulte o uso da loja, limites atuais e opções de assinatura.</p></div></div>
    {error && <div className="form-error">{error}</div>}
    {feedback && <div className="feedback">{feedback}</div>}
    <section className="panel billing-summary">
      <div><p className="eyebrow">PLANO ATUAL</p><h2>{selectedPlan?.name ?? subscription?.plan ?? "Teste"}</h2><span className={`status-pill status-${status}`}>{statusLabels[status] ?? status}</span></div>
      <div><strong>{productCount} / {productLimit}</strong><span>produtos cadastrados</span><div className="usage-track"><i style={{ width: `${Math.min(100, productCount / Math.max(1, productLimit) * 100)}%` }}/></div></div>
      <div><strong>{memberCount} / {memberLimit}</strong><span>pessoas na equipe</span><div className="usage-track"><i style={{ width: `${Math.min(100, memberCount / Math.max(1, memberLimit) * 100)}%` }}/></div></div>
      <div><strong>{subscription?.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString("pt-BR") : subscription?.periodEndsAt ? new Date(subscription.periodEndsAt).toLocaleDateString("pt-BR") : "—"}</strong><span>{status === "trialing" ? "fim do teste" : "próxima cobrança informada"}</span></div>
    </section>
    {!paymentReady && <div className="draft-notice">Checkout indisponível até configurar credenciais e segredo do webhook do Mercado Pago.</div>}
    {!canManage && <div className="draft-notice">Somente administradores e proprietários podem alterar a assinatura.</div>}
    <section className="billing-plans">
      {plans.length === 0 && <div className="panel empty-state"><h2>Planos em preparação</h2><p>Os planos serão disponibilizados depois que o catálogo e os preços forem configurados.</p></div>}
      {plans.map((plan) => <article className="panel billing-plan" key={plan.id}>
        <p className="eyebrow">{plan.code.toUpperCase()}</p><h2>{plan.name}</h2><p>{plan.description || "Plano GeekPrice."}</p>
        <strong className="billing-price">{money(plan.monthlyPrice)}{plan.monthlyPrice && <small>/mês</small>}</strong>
        <ul><li>Até {plan.productLimit.toLocaleString("pt-BR")} produtos</li><li>Até {plan.memberLimit.toLocaleString("pt-BR")} pessoas na equipe</li></ul>
        <button className="primary full" disabled={!canManage || !paymentReady || !plan.checkoutAvailable || busyPlan !== "" || plan.code === subscription?.plan} onClick={() => choosePlan(plan.id)}>
          {busyPlan === plan.id ? "Processando..." : plan.code === subscription?.plan ? "Plano atual" : plan.checkoutAvailable ? "Escolher plano" : "Preço a configurar"}
        </button>
      </article>)}
    </section>
    {canManage && subscription?.status !== "canceled" && <div className="billing-cancel"><button className="secondary" disabled={canceling} onClick={cancelSubscription}>{canceling ? "Cancelando..." : "Cancelar assinatura"}</button></div>}
    <p className="billing-footnote">Pagamentos são processados no ambiente seguro do Mercado Pago. A alteração do plano em uma assinatura ativa atualiza o valor recorrente para a próxima cobrança.</p>
  </div>;
}
