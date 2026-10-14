"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Guidance = {
  id: string;
  name: string;
  currentPrice: number;
  marketPrice: number | null;
  minimumPrice: number;
  suggestedPrice: number;
  safetyGate: string;
  safetyStatus: string;
  safetyReason: string;
};
type Queue = { safe: Guidance[]; flagged: Guidance[]; unchanged: Guidance[] };
type Item = { id: string; name: string; marketPrice: number | null };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ProductPriceGuidance({ items, detail = false }: { items: Item[]; detail?: boolean }) {
  const [queue, setQueue] = useState<Map<string, Guidance> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/autopilot/queue?channel=counter")
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<Queue>; })
      .then((body) => { if (active) setQueue(new Map([...body.safe, ...body.flagged, ...body.unchanged].map((item) => [item.id, item]))); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  if (items.length === 0) return null;
  return <section className={detail ? "product-guidance detail" : "product-guidance"} aria-label="Orientações de preço">
    <div className="product-guidance-heading"><div><h2>Orientação de preço</h2><p>{detail ? "Entenda o cálculo antes de tomar qualquer decisão." : "Veja o que falta para ter uma recomendação e compare seus produtos em BRL. Nada é alterado aqui."}</p></div>{!detail && <Link href="/market">Ver minhas cartas no Mercado</Link>}</div>
    {error ? <p className="muted">Não foi possível carregar as orientações agora.</p> : !queue ? <p className="muted">Calculando orientações...</p> : <div className="product-guidance-list">{items.map((item) => {
      const guidance = queue.get(item.id);
      if (!guidance) return null;
      const actionable = guidance.marketPrice != null && guidance.safetyGate !== "missing_cost" && guidance.safetyGate !== "missing_current_price" && guidance.safetyGate !== "margin_below_minimum";
      return <div className="product-guidance-item" key={item.id}>
        {!detail && <strong>{item.name}</strong>}
        <span>{guidance.marketPrice == null ? "Sem cotação BRL recente" : `Mercado BRL: ${money.format(guidance.marketPrice)}`}</span>
        <span>Piso mínimo calculado: {money.format(guidance.minimumPrice)}</span>
        <strong className={actionable ? "guidance-value" : "guidance-preview"}>{actionable ? `Sugestão para análise: ${money.format(guidance.suggestedPrice)}` : `Simulação por custo: ${money.format(guidance.suggestedPrice)}`}</strong>
        <small>{guidance.marketPrice == null ? "Não é recomendação de mercado e não altera seu preço. Associe uma fonte brasileira da edição correta no Mercado." : guidance.safetyReason}</small>
        <Link href={guidance.marketPrice == null ? "/market" : "/recommendations"}>{guidance.marketPrice == null ? "Consultar Mercado" : "Revisar no Autopilot"}</Link>
      </div>;
    })}</div>}
  </section>;
}
