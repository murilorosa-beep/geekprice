/* eslint-disable @next/next/no-img-element -- Imagem fornecida pelo catálogo da PkmnPrices. */
"use client";

import { useState } from "react";

type Card = {
  id: number;
  name: string;
  imageUrl: string | null;
  number: string | null;
  totalSetNumber: string | null;
  setName: string | null;
  setId: number | null;
  rarity: string | null;
};

type Detail = Card & {
  prices: Array<{
    source: string;
    currency: "USD";
    condition: string;
    variant: string;
    marketPrice: number | null;
    referenceAt: string | null;
  }>;
};

type SetOption = { id: number; name: string; language?: string; card_count?: number };
const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

export function PkmnPricesLookup() {
  const [name, setCardName] = useState("");
  const [number, setNumber] = useState("");
  const [setName, setSetName] = useState("");
  const [setId, setSetId] = useState<number | null>(null);
  const [sets, setSets] = useState<SetOption[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [condition, setCondition] = useState("");
  const [variant, setVariant] = useState("");
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function consult(params: URLSearchParams) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/market/pkmnprices?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      return body;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar a PkmnPrices.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function findSets() {
    if (setName.trim().length < 2) return;
    setSetId(null);
    setSets([]);
    setCards([]);
    setDetail(null);
    const body = await consult(new URLSearchParams({ kind: "sets", name: setName.trim() }));
    if (body) setSets(body.sets ?? []);
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (setName.trim() && !setId) {
      setError("Escolha uma coleção na lista para garantir a edição correta, ou apague o campo Coleção.");
      return;
    }
    setCards([]);
    setDetail(null);
    setSearched(false);
    const params = new URLSearchParams({ kind: "cards" });
    if (name.trim()) params.set("name", name.trim());
    if (number.trim()) params.set("number", number.trim());
    if (setId) params.set("setId", String(setId));
    const body = await consult(params);
    if (body) { setCards(body.cards ?? []); setSearched(true); }
  }

  async function selectCard(id: number) {
    const body = await consult(new URLSearchParams({ kind: "card", id: String(id) }));
    if (body) { setDetail(body.card ?? null); setCondition(""); setVariant(""); }
  }

  const prices = detail?.prices.filter((price) => (!condition || price.condition === condition) && (!variant || price.variant === variant)) ?? [];
  const conditions = [...new Set(detail?.prices.map((price) => price.condition) ?? [])];
  const variants = [...new Set(detail?.prices.map((price) => price.variant) ?? [])];

  return <section className="panel" style={{ padding: 24 }} aria-label="Preços internacionais de cartas Pokémon físicas">
    <h2>Pokémon físico · PkmnPrices</h2>
    <p>Consulte o preço do TCGplayer em USD para uma carta física específica. Escolha a coleção, o número, a condição e o acabamento. Pokémon TCG Pocket não é coberto por esta fonte.</p>
    <div className="form-grid" style={{ marginTop: 20 }}>
      <label className="field">Carta (nome em inglês)<input value={name} onChange={(event) => { setCardName(event.target.value); setCards([]); setDetail(null); setSearched(false); }} placeholder="Ex.: Charizard ex" maxLength={80} /></label>
      <label className="field">Número na coleção<input value={number} onChange={(event) => { setNumber(event.target.value); setCards([]); setDetail(null); setSearched(false); }} placeholder="Ex.: 006 ou 006/197" maxLength={30} /></label>
      <label className="field">Coleção (nome em inglês)<input value={setName} onChange={(event) => { setSetName(event.target.value); setSetId(null); setSets([]); setCards([]); setDetail(null); setSearched(false); }} placeholder="Ex.: Obsidian Flames" maxLength={80} /></label>
    </div>
    <div className="page-actions" style={{ marginTop: 16, flexWrap: "wrap" }}>
      <button type="button" className="secondary small" disabled={busy || setName.trim().length < 2} onClick={() => void findSets()}>{busy ? "Consultando..." : "Encontrar coleção"}</button>
      <form onSubmit={search}><button className="primary small" disabled={busy || (!name.trim() && !number.trim())}>Buscar cartas</button></form>
    </div>
    {sets.length > 0 && <div style={{ marginTop: 18 }}><strong>Escolha a coleção exata:</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>{sets.map((set) => <button key={set.id} type="button" className={setId === set.id ? "primary small" : "secondary small"} onClick={() => { setSetId(set.id); setSetName(set.name); setSets([]); setCards([]); setDetail(null); setSearched(false); }}>{set.name}{set.card_count != null ? ` · ${set.card_count} cartas` : ""}</button>)}</div></div>}
    {setId && <p style={{ marginTop: 12 }}>Coleção selecionada: <strong>{setName}</strong> (ID {setId}).</p>}
    {error && <p role="alert" className="form-error" style={{ marginTop: 16 }}>{error}</p>}
    {searched && cards.length === 0 && <p style={{ marginTop: 20 }}>Nenhuma carta física encontrada com esses filtros. Confira a coleção e o número; cartas Pocket não terão correspondência aqui.</p>}
    {cards.length > 0 && <div style={{ display: "grid", gap: 10, marginTop: 24 }}><h3>Escolha a impressão exata</h3>{cards.map((card) => <button key={card.id} type="button" className="secondary" disabled={busy} onClick={() => void selectCard(card.id)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%" }}>
      {card.imageUrl && /^https:\/\//.test(card.imageUrl) && <img src={card.imageUrl} alt="" style={{ width: 44, height: 62, objectFit: "contain" }} />}
      <span><strong>{card.name}</strong><br /><small>{card.setName ?? "Coleção não informada"} · nº {card.number ?? "—"}{card.totalSetNumber ? `/${card.totalSetNumber}` : ""} · {card.rarity ?? "Raridade não informada"}</small></span>
    </button>)}</div>}
    {detail && <div style={{ marginTop: 28 }}>
      <h3>{detail.name} · {detail.setName ?? "Coleção não informada"} · nº {detail.number ?? "—"}{detail.totalSetNumber ? `/${detail.totalSetNumber}` : ""}</h3>
      <p>Referência internacional para esta impressão. Cada linha corresponde a uma condição e acabamento específicos.</p>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <label className="field">Condição<select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="">Todas as condições</option>{conditions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="field">Acabamento<select value={variant} onChange={(event) => setVariant(event.target.value)}><option value="">Todos os acabamentos</option>{variants.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
      {prices.length === 0 ? <p>Nenhum preço disponível para essa combinação.</p> : <div className="table-wrap" style={{ marginTop: 16 }}><table><thead><tr><th>Condição</th><th>Acabamento</th><th>Preço de mercado</th><th>Atualizado</th></tr></thead><tbody>{prices.map((price, index) => <tr key={`${price.condition}-${price.variant}-${index}`}><td>{price.condition}</td><td>{price.variant}</td><td>{price.marketPrice == null ? "—" : usd.format(price.marketPrice)}</td><td>{price.referenceAt ? new Date(price.referenceAt).toLocaleDateString("pt-BR") : "—"}</td></tr>)}</tbody></table></div>}
      <p style={{ marginTop: 12 }}><a href={`https://www.pkmnprices.com/catalog/cards/${detail.id}`} target="_blank" rel="noopener noreferrer">Conferir esta carta na PkmnPrices</a></p>
    </div>}
    <p className="muted" style={{ marginTop: 24 }}>Fonte: PkmnPrices / TCGplayer. Valores em USD não são cotação brasileira e não alteram o estoque nem o Autopilot.</p>
  </section>;
}
