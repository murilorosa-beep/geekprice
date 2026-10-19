"use client";
import { useEffect, useState } from "react";
import { GeekPriceIndexStock } from "./geekprice-index-stock";
import { IndexReferenceSummary } from "./index-reference-summary";
import type { IndicativeMarketReference } from "@/lib/index-reference";
type Item = { inventoryItemId: string; name: string; currentPrice: number; suggestedPrice: number; indicativeMarketReference?: IndicativeMarketReference | null };
export function IndexSupervisedRecommendations({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function load() {
    const response = await fetch("/api/recommendations");
    if (!response.ok) { setError("Não foi possível carregar as sugestões do Index."); return; }
    const body = await response.json();
    setItems(body.items ?? body);
  }
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!active || document.visibilityState !== "visible") return;
      try { await load(); } catch { if (active) setError("Falha ao consultar sugestões."); }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return <section className="panel" aria-label="Recomendações supervisionadas do Index"><h2>Index BRL · revisão supervisionada</h2>
    <p>Referências indicativas exigem aprovação individual. O Autopilot permanece bloqueado para estas cotações.</p>{error && <p role="alert">{error}</p>}
    {items.filter((item) => item.indicativeMarketReference).map((item) => <div key={item.inventoryItemId} className="gi-stock">
      <h3>{item.name}</h3><IndexReferenceSummary reference={item.indicativeMarketReference} currentPrice={item.currentPrice}/>
      <p>Sugestão supervisionada: {item.suggestedPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
      <button className="secondary" onClick={() => setSelected(item.inventoryItemId)}>Revisar sugestão de {item.name}</button>
    </div>)}
    {selected && <GeekPriceIndexStock itemId={selected} canManage={canManage} onClose={() => setSelected(null)} onPriceChanged={load}/>}
  </section>;
}
