/* eslint-disable @next/next/no-img-element -- Imagem fornecida pelo catálogo da PkmnPrices. */
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Globe2, Layers, Search } from "lucide-react";

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
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!detail) return;
    detailRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
  }, [detail]);

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

  return <section className="panel pkmn-lookup" aria-label="Preços internacionais de cartas Pokémon físicas" aria-busy={busy}>
    <header className="pkmn-intro"><div className="pkmn-source-icon"><Globe2 size={23}/></div><div><span className="eyebrow">REFERÊNCIA INTERNACIONAL</span><h2>Pokémon físico</h2><p>Encontre a impressão exata e confira o preço do TCGplayer por condição e acabamento.</p></div><span className="pkmn-currency-badge">TCGplayer · USD</span></header>
    <form className="pkmn-search-form" onSubmit={search}>
      <label className="field">Carta (nome em inglês)<input value={name} onChange={(event) => { setCardName(event.target.value); setCards([]); setDetail(null); setSearched(false); }} placeholder="Ex.: Charizard ex" maxLength={80}/></label>
      <label className="field">Número na coleção<input value={number} onChange={(event) => { setNumber(event.target.value); setCards([]); setDetail(null); setSearched(false); }} placeholder="Ex.: 006 ou 006/197" maxLength={30}/></label>
      <label className="field">Coleção (nome em inglês)<input value={setName} onChange={(event) => { setSetName(event.target.value); setSetId(null); setSets([]); setCards([]); setDetail(null); setSearched(false); }} placeholder="Ex.: Obsidian Flames" maxLength={80}/></label>
      <div className="pkmn-search-actions"><button type="button" className="secondary" disabled={busy || setName.trim().length < 2} onClick={() => void findSets()}><Layers size={16}/>{busy ? "Consultando..." : "Encontrar coleção"}</button><button type="submit" className="primary" disabled={busy || (!name.trim() && !number.trim())}><Search size={16}/>{busy ? "Buscando..." : "Buscar cartas"}</button></div>
    </form>
    {sets.length > 0 && <section className="pkmn-set-options"><h3>Escolha a coleção exata</h3><div>{sets.map((set) => <button key={set.id} type="button" className={setId === set.id ? "primary" : "secondary"} onClick={() => { setSetId(set.id); setSetName(set.name); setSets([]); setCards([]); setDetail(null); setSearched(false); }}>{set.name}{set.card_count != null && <small>{set.card_count} cartas</small>}</button>)}</div></section>}
    {setId && <p className="pkmn-selected-set"><Check size={15}/> Coleção selecionada: <strong>{setName}</strong></p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {searched && cards.length === 0 && <div className="tcg-empty"><Search size={26}/><strong>Nenhuma carta física encontrada</strong><p>Confira a coleção e o número. Cartas de TCG Pocket não são cobertas por esta fonte.</p></div>}
    {cards.length > 0 && <section className="pkmn-results"><div className="pkmn-section-title"><div><span className="eyebrow">ESCOLHA A EDIÇÃO</span><h3>Qual destas cartas é a sua?</h3></div><span>{cards.length} resultado(s)</span></div><div className="pkmn-results-grid">{cards.map((card) => <button key={card.id} type="button" className={`pkmn-card-choice${detail?.id === card.id ? " selected" : ""}`} aria-pressed={detail?.id === card.id} disabled={busy} onClick={() => void selectCard(card.id)}>
      <span className="pkmn-choice-art">{card.imageUrl && /^https:\/\//.test(card.imageUrl) ? <img src={card.imageUrl} alt="" loading="lazy"/> : <Layers size={32}/>}<span>{detail?.id === card.id ? <><Check size={13}/> Selecionada</> : <>Ver preço <ArrowUpRight size={13}/></>}</span></span>
      <strong>{card.name}</strong><small>{card.setName ?? "Coleção não informada"}</small><span className="pkmn-choice-meta"><span>nº {card.number ?? "—"}{card.totalSetNumber ? `/${card.totalSetNumber}` : ""}</span><span>{card.rarity ?? "Raridade não informada"}</span></span>
    </button>)}</div></section>}
    {detail && <section ref={detailRef} className="pkmn-detail" aria-label="Preços da impressão selecionada" aria-live="polite">
      <header className="pkmn-detail-heading">{detail.imageUrl?.startsWith("https://") && <img src={detail.imageUrl} alt={`Carta ${detail.name}`}/>}<div><span className="eyebrow">IMPRESSÃO SELECIONADA</span><h3>{detail.name}</h3><p>{detail.setName ?? "Coleção não informada"} · nº {detail.number ?? "—"}{detail.totalSetNumber ? `/${detail.totalSetNumber}` : ""}</p><a href={`https://www.pkmnprices.com/catalog/cards/${detail.id}`} target="_blank" rel="noopener noreferrer">Conferir na PkmnPrices <ArrowUpRight size={14}/></a></div><span className="pkmn-currency-badge">Preços em USD</span></header>
      <div className="form-grid pkmn-price-filters"><label className="field">Condição<select aria-label="Condição" value={condition} onChange={(event) => setCondition(event.target.value)}><option value="">Todas as condições</option>{conditions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="field">Acabamento<select aria-label="Acabamento" value={variant} onChange={(event) => setVariant(event.target.value)}><option value="">Todos os acabamentos</option>{variants.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
      {prices.length === 0 ? <p className="pkmn-no-price">Nenhum preço disponível para essa combinação.</p> : <div className="table-wrap pkmn-price-table"><table><thead><tr><th>Condição</th><th>Acabamento</th><th>Preço de mercado (USD)</th><th>Atualizado</th></tr></thead><tbody>{prices.map((price, index) => <tr key={`${price.condition}-${price.variant}-${index}`}><td>{price.condition}</td><td>{price.variant}</td><td><strong>{price.marketPrice == null ? "—" : usd.format(price.marketPrice)}</strong></td><td>{price.referenceAt ? new Date(price.referenceAt).toLocaleDateString("pt-BR") : "—"}</td></tr>)}</tbody></table></div>}
    </section>}
    <footer className="pkmn-disclaimer"><Globe2 size={16}/><p><strong>Referência internacional · PkmnPrices / TCGplayer.</strong> Valores em USD não são cotação brasileira, não alteram o estoque nem o Autopilot. Esta fonte consulta cartas físicas; TCG Pocket não é coberto.</p></footer>
  </section>;
}
