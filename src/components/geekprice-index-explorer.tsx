/* eslint-disable @next/next/no-img-element -- Imagens são referências externas do catálogo, quando presentes. */
"use client";

import { useState } from "react";
import { Search } from "lucide-react";

type Card = { id: string; game: string; name: string; setName: string; collectorNumber: string;
  imageUrl: string | null; language: string | null; finish: string | null; coverageStatus: string;
  referenceBrl: string | null; lastSeenAt: string | null };
type Price = { card: Card; status: string; price: null | {
  askingMin: string; askingMax: string; providerAverage: string | null; observedAt: string; lastSeenAt: string;
  source: { name: string; url: string; attributionUrl: string }; quality: { level: string; score: number; reasons: string[] };
  autoApplyEligible: boolean;
} };
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function GeekPriceIndexExplorer() {
  const [term, setTerm] = useState("");
  const [game, setGame] = useState<"pokemon" | "magic">("pokemon");
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<Price | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);

  async function search(nextPage = 1) {
    if (term.trim().length < 2) return;
    setBusy(true); setMessage(""); setSelected(null);
    try {
      const response = await fetch(`/api/geekprice-index/v1/search?q=${encodeURIComponent(term.trim())}&game=${game}&limit=12&page=${nextPage}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha na consulta.");
      setCards(body.data); setPage(nextPage); setPages(body.pagination.pages); setTotal(body.pagination.total);
      if (!body.data.length) setMessage("Nenhuma impressão encontrada. Confira o nome ou tente outra edição.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na consulta."); }
    finally { setBusy(false); }
  }
  async function viewPrice(id: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/geekprice-index/v1/cards/${id}/price`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao obter preço.");
      setSelected(body.data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao obter preço."); }
    finally { setBusy(false); }
  }
  return <section className="gi-explorer" aria-label="GeekPrice Index">
    <header className="gi-heading"><div><p className="eyebrow">REFERÊNCIAS BRASILEIRAS</p><h2>GeekPrice Index</h2>
      <p>Encontre a impressão exata e confira preços anunciados em reais, com fonte e data.</p></div>
      <span className="gi-heading-mark">GP<span>INDEX</span></span></header>
    <form className="gi-search" onSubmit={(event) => { event.preventDefault(); void search(1); }}>
      <select aria-label="Jogo" value={game} onChange={(event) => { setGame(event.target.value as "pokemon" | "magic"); setCards([]); setSelected(null); }}>
        <option value="pokemon">Pokémon</option><option value="magic">Magic</option></select>
      <label><Search size={17}/><input aria-label="Nome da carta" value={term} onChange={(event) => setTerm(event.target.value)}
        minLength={2} maxLength={120} placeholder="Busque uma carta pelo nome" required /></label>
      <button className="primary" disabled={busy}>{busy ? "Buscando..." : "Buscar preços BRL"}</button>
    </form>
    {!cards.length && !message && <div className="gi-start"><Search size={25}/><strong>Pesquise uma carta para ver suas edições</strong>
      <span>O preço só é comparável quando coleção, número e variante estão corretos.</span></div>}
    {message && <p className="gi-message" role="status">{message}</p>}
    {cards.length > 0 && <><div className="gi-results-title"><strong>{total} impressão(ões) encontrada(s)</strong><span>Referências de anúncios, não vendas concluídas</span></div>
      <div className="gi-results">{cards.map((card) => <button className={selected?.card.id === card.id ? "gi-result active" : "gi-result"}
        type="button" key={card.id} onClick={() => void viewPrice(card.id)} disabled={busy}>
        {card.imageUrl?.startsWith("https://") ? <img src={card.imageUrl} alt="" loading="lazy" /> : <span className="gi-art" aria-hidden="true">{card.game === "pokemon" ? "PK" : "MTG"}</span>}
        <span className="gi-result-identity"><strong>{card.name}</strong><small>{card.setName} · nº {card.collectorNumber}</small>
          <small>{card.language ?? "Idioma não informado"} · {card.finish ?? "Acabamento não informado"}</small></span>
        <span className="gi-result-price"><small>Referência BRL</small><strong>{card.referenceBrl ? brl.format(Number(card.referenceBrl)) : "Sem preço"}</strong>
          <small>{card.lastSeenAt ? new Date(card.lastSeenAt).toLocaleDateString("pt-BR") : "Sem atualização"}</small></span></button>)}</div>
      <div className="gi-pagination"><span>Página {page} de {pages}</span><div><button type="button" className="secondary" disabled={page <= 1 || busy} onClick={() => void search(page - 1)}>Anterior</button>
        <button type="button" className="secondary" disabled={page >= pages || busy} onClick={() => void search(page + 1)}>Próxima</button></div></div></>}
    {selected && <div className="gi-detail"><div className="gi-detail-top"><div><p className="eyebrow">IMPRESSÃO SELECIONADA</p><h3>{selected.card.name}</h3>
      <p>{selected.card.setName} · nº {selected.card.collectorNumber}</p></div><span className="gi-match-pill">{selected.status === "stale" ? "Referência antiga" : "Referência datada"}</span></div>
      {selected.price ? <><div className="gi-price-hero"><span>Média informada pela fonte</span><strong>{selected.price.providerAverage ? brl.format(Number(selected.price.providerAverage)) : "Não informada"}</strong>
        <small>Mínimo {brl.format(Number(selected.price.askingMin))} · Máximo {brl.format(Number(selected.price.askingMax))}</small></div>
        <p className="gi-provenance"><strong>Fonte:</strong> <a href={selected.price.source.url} target="_blank" rel="noopener noreferrer">{selected.price.source.name}</a>
          <span>Observado em {new Date(selected.price.observedAt).toLocaleString("pt-BR")}</span></p>
        <p className="gi-caution">Qualidade {selected.price.quality.level} ({selected.price.quality.score.toFixed(2)}): {selected.price.quality.reasons.join("; ")}.
          Requer revisão humana antes de usar em uma decisão de preço.</p>
        <p className="gi-attribution">Dados de <a href={selected.price.source.attributionUrl} target="_blank" rel="noopener noreferrer">{selected.price.source.name}</a>.</p>
      </> : <p>Esta impressão está cadastrada, mas ainda não possui preço brasileiro observado.</p>}
    </div>}
  </section>;
}
