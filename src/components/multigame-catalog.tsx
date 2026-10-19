/* eslint-disable @next/next/no-img-element -- Imagens pertencem aos catálogos externos autorizados. */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Database, Info, Search, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { TcgCardFan } from "./tcg-art";

type Price = {
  externalVariantId: string;
  sourceMarket: string;
  currency: "USD" | "EUR";
  price: number;
  finish: string;
  condition: string | null;
};

type Card = {
  id: string;
  name: string;
  localId: string | null;
  setName: string | null;
  rarity: string | null;
  image: string | null;
  language: string;
  finishes: string[];
  prices?: Price[];
};

const games = [
  { id: "pokemon", name: "Pokémon", available: true },
  { id: "magic", name: "Magic: The Gathering", available: true },
  { id: "lorcana", name: "Disney Lorcana", available: false },
  { id: "onepiece", name: "One Piece", available: false },
  { id: "gundam", name: "Gundam", available: false },
  { id: "riftbound", name: "Riftbound", available: false },
] as const;

const money = (currency: string, value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);

export function MultigameCatalog() {
  const router = useRouter();
  const [game, setGame] = useState("pokemon");
  const [q, setQ] = useState("");
  const [setName, setSetName] = useState("");
  const [number, setNumber] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<Card | null>(null);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    finish: "standard", condition: "near_mint", organizationSku: "", barcode: "",
    cost: "0", price: "0", quantity: "1", desiredMarginPercent: "25",
  });

  const priceGroups = useMemo(() => {
    const groups = new Map<string, Price[]>();
    for (const price of selected?.prices ?? []) {
      const key = `${price.currency}:${price.finish}`;
      groups.set(key, [...(groups.get(key) ?? []), price]);
    }
    return [...groups.entries()].map(([key, prices]) => ({
      key,
      currency: prices[0].currency,
      finish: prices[0].finish,
      source: [...new Set(prices.map((price) => price.sourceMarket))].join(" + "),
      minimum: Math.min(...prices.map((price) => price.price)),
      maximum: Math.max(...prices.map((price) => price.price)),
      count: prices.length,
    }));
  }, [selected]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setSource("");
    setSelected(null);
    setCards([]);
    const params = new URLSearchParams({ game, q, language: game === "pokemon" ? "pt-br" : "en" });
    if (setName) params.set("set", setName);
    if (number) params.set("number", number);
    try {
      const response = await fetch(`/api/catalog/cards?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Fonte indisponível.");
      setCards(body.items ?? []);
      setSource(body.source ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar o catálogo.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(card: Card) {
    setBusy(true);
    setError("");
    try {
      const url = game === "pokemon"
        ? `/api/market/catalog/${encodeURIComponent(card.id)}?language=${encodeURIComponent(card.language)}`
        : `/api/catalog/cards/magic/${encodeURIComponent(card.id)}`;
      const response = await fetch(url);
      const detail = await response.json();
      if (!response.ok) throw new Error(detail.error ?? "Não foi possível abrir esta impressão.");
      setSelected(detail);
      setForm((value) => ({ ...value, finish: detail.finishes?.[0] ?? "standard" }));
      window.setTimeout(() => document.querySelector(".catalog-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir esta impressão.");
    } finally {
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const endpoint = game === "magic" ? "/api/smart-registration/magic" : "/api/smart-registration/card";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          externalCardId: selected.id,
          language: selected.language,
          quantity: Number(form.quantity),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível cadastrar.");
      setMessage(`${selected.name} foi incluída no estoque com ${body.observationsInserted ?? 0} referência(s) de preço.`);
      setSelected(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-content catalog-page">
    <section className="catalog-hero">
      <div>
        <span className="hero-kicker"><Sparkles size={15}/> Inteligência de catálogo</span>
        <h1>Encontre a carta certa.<br/><span>Veja preços reais.</span></h1>
        <p>Consulte impressões oficiais, compare referências internacionais e cadastre no estoque sem digitar todos os dados.</p>
        <div className="catalog-trust">
          <span><BadgeCheck size={16}/> Pokémon via TCGdex</span>
          <span><BadgeCheck size={16}/> Magic via Scryfall</span>
          <span><ShieldCheck size={16}/> Dados separados por loja</span>
        </div>
      </div>
      <TcgCardFan/>
    </section>

    {error && <div className="form-error catalog-feedback">{error}</div>}
    {message && <div className="feedback catalog-feedback">{message}</div>}

    <section className="panel catalog-search-panel">
      <div className="catalog-section-heading">
        <div><span className="section-step">01</span><div><h2>Pesquisar catálogo</h2><p>Informe o nome e, se souber, refine pela coleção ou número.</p></div></div>
        <span className="live-badge"><i/> Fontes online</span>
      </div>
      <div className="game-tabs" role="group" aria-label="Escolha o jogo">
        {games.map((item) => <button
          type="button"
          key={item.id}
          className={game === item.id ? "active" : ""}
          onClick={() => { setGame(item.id); setCards([]); setSelected(null); setSource(""); }}
          title={item.available ? `Pesquisar ${item.name}` : `${item.name} requer uma conta Scrydex`}
        >{item.name}{!item.available && <small>Scrydex</small>}</button>)}
      </div>
      <form className="catalog-search-form" onSubmit={search}>
        <label className="search-main"><span>Nome da carta</span><div><Search size={19}/><input required autoFocus placeholder={game === "magic" ? "Ex.: Black Lotus, Sol Ring..." : "Ex.: Pikachu, Charizard..."} value={q} onChange={(event) => setQ(event.target.value)}/></div></label>
        <label><span>Coleção</span><input placeholder="Nome ou código" value={setName} onChange={(event) => setSetName(event.target.value)}/></label>
        <label><span>Número</span><input placeholder="Ex.: 025" value={number} onChange={(event) => setNumber(event.target.value)}/></label>
        <button className="primary catalog-search-button" disabled={busy}><Search size={18}/>{busy ? "Consultando..." : "Consultar cartas"}</button>
      </form>
    </section>

    {source && <div className="catalog-source"><Database size={17}/><span>Resultados fornecidos por <strong>{source}</strong>. Selecione uma carta para consultar os preços disponíveis.</span></div>}

    {source && cards.length === 0 && !busy && <section className="panel catalog-empty"><Search/><h2>Nenhuma carta encontrada</h2><p>Tente somente parte do nome ou remova os filtros de coleção e número.</p></section>}

    {cards.length > 0 && <section className="catalog-results">
      <div className="catalog-results-title"><div><span className="section-step">02</span><div><h2>Escolha a impressão</h2><p>{cards.length} resultado(s) — confira coleção e número.</p></div></div></div>
      <div className="catalog-grid">
        {cards.map((card) => <button className="catalog-card" key={card.id} onClick={() => choose(card)}>
          <div className="catalog-card-image">{card.image ? <img src={card.image} alt="" loading="lazy"/> : <span>{card.name.slice(0, 2)}</span>}<i>Ver detalhes</i></div>
          <strong>{card.name}</strong>
          {card.image?.includes("/tcgp/") && <small>TCG Pocket · carta digital sem cotação BRL nesta fonte</small>}
          <small>{card.setName ?? "Abra para ver a coleção"}</small>
          <em>nº {card.localId ?? "—"} · {card.language.toUpperCase()} · {card.id}</em>
        </button>)}
      </div>
    </section>}

    {selected && <section className="panel catalog-detail">
      {selected.image?.includes("/tcgp/") && <div className="autopilot-help">Esta impressão é do Pokémon TCG Pocket, um catálogo digital. As fontes de preço conectadas nesta loja cobrem cartas físicas; este cadastro não receberá cotação BRL nem alteração automática pelo Autopilot.</div>}
      <div className="catalog-detail-product">
        <div className="catalog-detail-image">{selected.image ? <img src={selected.image} alt=""/> : <span>{selected.name.slice(0, 2)}</span>}</div>
        <div className="catalog-detail-copy">
          <span className="section-step">03</span>
          <p className="eyebrow">IMPRESSÃO CONFIRMADA</p>
          <h2>{selected.name}</h2>
          <p>{selected.setName ?? "Coleção não informada"} · nº {selected.localId ?? "—"}</p>
          <div className="catalog-tags"><span>{selected.rarity ?? "Raridade não informada"}</span><span>{selected.language.toUpperCase()}</span><span>{selected.finishes.length || 1} acabamento(s)</span></div>
        </div>
      </div>

      <div className="price-panel">
        <div className="price-panel-title"><div><Tag size={20}/><div><h3>Referências de preço</h3><p>Valores recebidos agora da fonte selecionada.</p></div></div><span>{source}</span></div>
        {priceGroups.length ? <div className="price-grid">{priceGroups.map((price) => <article key={price.key}>
          <span>{price.currency} · {price.finish}</span>
          <strong>{money(price.currency, price.minimum)}</strong>
          {price.maximum !== price.minimum && <small>até {money(price.currency, price.maximum)}</small>}
          <em>{price.source} · {price.count} ref.</em>
        </article>)}</div> : <div className="no-prices"><Info size={20}/><div><strong>Sem preço disponível nesta impressão</strong><span>O cadastro ainda pode ser feito; a fonte não retornou uma referência para esta variante.</span></div></div>}
        <p className="price-disclaimer"><Info size={15}/> USD/EUR são referências internacionais e não são convertidas automaticamente para preço brasileiro.</p>
      </div>

      <form className="catalog-stock-form" onSubmit={create}>
        <div className="catalog-form-heading"><div><h3>Adicionar ao estoque</h3><p>Preencha apenas os dados comerciais da sua loja.</p></div></div>
        <div className="form-grid">
          <label className="field">Acabamento<select value={form.finish} onChange={(event) => setForm({ ...form, finish: event.target.value })}>{(selected.finishes.length ? selected.finishes : ["standard"]).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="field">Condição<select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })}><option value="near_mint">Near Mint</option><option value="new">Novo</option><option value="played">Played</option></select></label>
          <label className="field">SKU da loja<input required placeholder="Seu código interno" value={form.organizationSku} onChange={(event) => setForm({ ...form, organizationSku: event.target.value })}/></label>
          <label className="field">Código de barras<input inputMode="numeric" placeholder="Opcional" value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value.replace(/\D/g, "") })}/></label>
          <label className="field">Custo (R$)<input type="number" min="0" step=".01" required value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })}/></label>
          <label className="field">Preço atual (R$)<input type="number" min="0" step=".01" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })}/></label>
          <label className="field">Quantidade<input type="number" min="0" step="1" required value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })}/></label>
          <label className="field">Margem desejada (%)<input type="number" min="0" max="99" step=".01" required value={form.desiredMarginPercent} onChange={(event) => setForm({ ...form, desiredMarginPercent: event.target.value })}/></label>
        </div>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setSelected(null)}>Cancelar</button><button className="primary small" disabled={busy}>{busy ? "Salvando..." : "Adicionar ao estoque"}</button></div>
      </form>
    </section>}
  </div>;
}
