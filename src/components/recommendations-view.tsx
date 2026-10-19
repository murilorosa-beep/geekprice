"use client";

import { useMemo, useState } from "react";
import type { RecommendationView } from "@/server/recommendations/service";

const labels: Record<RecommendationView["status"], string> = { below_minimum: "Abaixo do mínimo", below_market: "Abaixo do mercado", above_market: "Acima do mercado", no_market: "Sem mercado", competitive: "Competitivo", indicative_reference: "Index BRL (indicativa)" };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function RecommendationsView({ initial }: { initial: RecommendationView[] }) {
  const [filter, setFilter] = useState("all"); const [sort, setSort] = useState("priority");
  const rows = useMemo(() => initial.filter((item) => filter === "all" || item.status === filter).sort((a, b) => sort === "difference" ? Math.abs(b.difference) - Math.abs(a.difference) : b.priority - a.priority), [initial, filter, sort]);
  const count = (status: RecommendationView["status"]) => initial.filter((item) => item.status === status).length;
  return <div className="page-content"><div className="page-title"><div><p className="eyebrow">DECISÕES BASEADAS EM CUSTO E POLÍTICA</p><h1>Recomendações</h1><p>Cada versão é persistida somente quando os parâmetros do cálculo mudam.</p></div></div>
    <div className="status-grid"><Stat label="Abaixo do mínimo" value={count("below_minimum")}/><Stat label="Abaixo do mercado" value={count("below_market")}/><Stat label="Acima do mercado" value={count("above_market")}/><Stat label="Sem dados externos" value={count("no_market")}/><Stat label="Oportunidades" value={initial.filter((item) => item.priority >= 3).length}/></div>
    <div className="filters"><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos os estados</option>{Object.entries(labels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="priority">Maior prioridade</option><option value="difference">Maior diferença</option></select></div>
    <section className="panel products-panel"><div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>ATUAL</th><th>MÍNIMO</th><th>MERCADO</th><th>RECOMENDADO</th><th>MARGEM</th><th>STATUS</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><div className="product-cell"><div className="product-thumb thumb-4">{item.name.slice(0,2).toUpperCase()}</div><div><strong>{item.name}</strong><span>{item.sku} · {item.explanation}</span></div></div></td><td>{money.format(item.currentPrice)}</td><td>{money.format(item.minimumPrice)}</td><td>{item.marketPrice == null ? "Sem dados" : money.format(item.marketPrice)}</td><td><strong>{money.format(item.suggestedPrice)}</strong></td><td>{item.estimatedMargin.toFixed(1)}%</td><td><span className={`status ${item.priority >= 4 ? "attention" : item.status === "competitive" ? "healthy" : "opportunity"}`}>{labels[item.status]}</span></td></tr>)}</tbody></table>{rows.length === 0 && <div className="empty">Nenhuma recomendação para este filtro. Cadastre produtos para iniciar os cálculos.</div>}</div></section>
  </div>;
}
function Stat({ label, value }: { label: string; value: number }) { return <article className="status-card"><span>{label}</span><strong>{value}</strong></article>; }
