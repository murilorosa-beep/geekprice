/* eslint-disable @next/next/no-img-element -- Imagens são as URLs de catálogo já salvas no estoque. */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Link2, Search, Sparkles } from "lucide-react";
import { BrazilianQuoteModal } from "@/components/brazilian-quote-modal";

type Item = {
  id: string;
  name: string;
  imageUrl: string | null;
  set: string | null;
  code: string | null;
  sku: string;
  language: string;
  finish: string;
  condition: string;
  stock: number;
  cost: number;
  desiredMarginPercent: number;
  currentPrice: number;
  marketPrice: number | null;
  catalogSource: string | null;
  canonicalId: string | null;
  catalogLinked: boolean;
};
type Result = { items: Item[]; total: number; page: number; pageSize: number };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function MarketMyCards({ canManage, onSearchEdition }: { canManage: boolean; onSearchEdition: (item: Item) => void }) {
  const [result, setResult] = useState<Result>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [quoteModalItem, setQuoteModalItem] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ q: query, page: String(page), pageSize: "20" });
    try {
      const response = await fetch(`/api/inventory?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o estoque.");
      setResult(body);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o estoque.");
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  async function associate(item: Item) {
    setLinkingId(item.id);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/market/associate-existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryItemId: item.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível associar esta edição.");
      setFeedback(`${item.name}: ${body.message}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível associar esta edição.");
    } finally {
      setLinkingId(null);
    }
  }

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <>
    <div className="market-guide-summary"><Link2 size={18}/><span><strong>Suas cartas e o mercado, lado a lado.</strong> O cadastro inteligente já associa a edição oficial. Só referências brasileiras recentes em BRL entram na comparação e liberam recomendação aplicável; USD/EUR são apenas contexto.</span></div>
    <section className="panel market-my-panel">
      <div className="panel-title"><div><h2>Cartas do meu estoque</h2><p>Compare seu preço atual com a referência BRL da mesma variante. Nenhum preço é alterado nesta aba.</p></div><span className="market-inventory-count">{result.total} produto(s)</span></div>
      <div className="market-my-toolbar"><label><Search size={17}/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar carta, coleção ou SKU" aria-label="Buscar cartas do estoque"/></label><button type="button" className="secondary small" onClick={() => void load()} disabled={loading}>Atualizar comparação</button></div>
      {feedback && <div className="feedback">{feedback}</div>}
      {error && <div className="form-error">{error}</div>}
      {loading ? <div className="empty">Carregando cartas...</div> : result.items.length === 0 ? <div className="empty">{query ? "Nenhuma carta encontrada para esta busca." : <>Ainda não há produtos no estoque. <Link href="/products">Cadastre sua primeira carta</Link>.</>}</div> : <div className="market-my-list">{result.items.map((item) => {
        const difference = item.marketPrice && item.marketPrice > 0 ? (item.currentPrice - item.marketPrice) / item.marketPrice * 100 : null;
        return <article className="market-my-card" key={item.id}>
          <button type="button" className="market-my-open" onClick={() => setSelected(item)} aria-label={`Ver detalhes de ${item.name}`}>
            {item.imageUrl && /^https:\/\//i.test(item.imageUrl) ? <img className="product-art" src={item.imageUrl} alt="" loading="lazy"/> : <span className="product-art-placeholder" aria-hidden="true">{item.name.slice(0, 2).toUpperCase()}</span>}
            <span className="market-my-identity"><strong>{item.name}</strong><small>{item.set ?? "Sem coleção"} · {item.code ?? "s/n"} · {item.language} · {item.finish} · SKU {item.sku}</small><span className={item.catalogLinked ? "market-link-state linked" : "market-link-state"}>{item.catalogLinked ? "Edição oficial associada" : item.canonicalId ? "Edição identificada; falta associar" : "Edição não identificada"}</span><small className="market-my-detail-hint">Ver detalhes da carta →</small></span>
          </button>
          <div className="market-my-price"><span>Seu preço</span><strong>{money.format(item.currentPrice)}</strong></div>
          <div className="market-my-price"><span>Média de referências BRL (30 dias)</span><strong>{item.marketPrice == null ? "Sem cotação" : money.format(item.marketPrice)}</strong>{difference != null && <small>{Math.abs(difference).toFixed(1)}% {difference < 0 ? "abaixo" : difference > 0 ? "acima" : "igual à referência"}</small>}</div>
          <div className="market-my-action">
            <button
              type="button"
              className="secondary small"
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              onClick={() => setQuoteModalItem(item)}
              title="Consultar cotações em reais na Liga Pokémon / mercado nacional"
            >
              <Sparkles size={13} style={{ color: "#10b981" }} /> Cotação BR
            </button>
            {!item.catalogLinked && item.canonicalId && canManage ? (
              <button className="secondary small" type="button" disabled={linkingId === item.id} onClick={() => void associate(item)}>
                {linkingId === item.id ? "Associando..." : "Associar edição"}
              </button>
            ) : !item.catalogLinked && canManage ? (
              <button className="secondary small" type="button" onClick={() => onSearchEdition(item)}>
                Buscar edição correta
              </button>
            ) : !item.catalogLinked ? (
              <span className="muted">Solicite ao gestor a associação da edição.</span>
            ) : item.marketPrice == null ? (
              <span className="muted">Sem cotação BRL.</span>
            ) : (
              <Link href="/recommendations" className="secondary small">Analisar preço</Link>
            )}
          </div>
        </article>;
      })}</div>}
      <div className="pagination"><span>Página {page} de {pages}</span><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><button type="button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
    </section>
    {selected && <div className="drawer-layer" onMouseDown={() => setSelected(null)}><section className="modal-card market-card-detail" role="dialog" aria-modal="true" aria-label={`Detalhes de ${selected.name}`} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="drawer-close" onClick={() => setSelected(null)} aria-label="Fechar detalhes">×</button><p className="eyebrow">CARTA NO MEU ESTOQUE</p><div className="product-detail-hero">{selected.imageUrl && /^https:\/\//i.test(selected.imageUrl) ? <img className="product-art large" src={selected.imageUrl} alt={`Carta ${selected.name}`}/> : <span className="product-art-placeholder large">{selected.name.slice(0, 2).toUpperCase()}</span>}<div><h2>{selected.name}</h2><p className="muted">{selected.set ?? "Sem coleção"} · nº {selected.code ?? "não informado"}</p><span className={selected.catalogLinked ? "market-link-state linked" : "market-link-state"}>{selected.catalogLinked ? "Edição oficial associada" : "Aguardando associação da edição"}</span></div></div><div className="detail-grid"><div><span>SKU</span><strong>{selected.sku}</strong></div><div><span>Idioma / acabamento</span><strong>{selected.language} · {selected.finish}</strong></div><div><span>Condição</span><strong>{selected.condition}</strong></div><div><span>Quantidade</span><strong>{selected.stock}</strong></div><div><span>Custo de aquisição</span><strong>{money.format(selected.cost)}</strong></div><div><span>Preço atual da loja</span><strong>{money.format(selected.currentPrice)}</strong></div><div><span>Margem desejada</span><strong>{selected.desiredMarginPercent}%</strong></div><div><span>Média BRL em 30 dias</span><strong>{selected.marketPrice == null ? "Sem cotação" : money.format(selected.marketPrice)}</strong></div></div>{selected.marketPrice == null && <p className="seller-review-warning">A carta pode estar vinculada ao catálogo internacional, mas ainda não há cotação brasileira recente para comparar preços automaticamente.</p>}<div className="seller-review-actions"><button type="button" className="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setQuoteModalItem(selected)}><Sparkles size={15} style={{ color: "#10b981" }} /> Cotação Liga Pokémon</button>{canManage && <Link href={`/products?edit=${selected.id}`} className="primary">Editar preço e estoque</Link>}<button type="button" className="secondary" onClick={() => setSelected(null)}>Fechar</button></div></section></div>}
    {quoteModalItem && (
      <BrazilianQuoteModal
        cardName={quoteModalItem.name}
        edition={quoteModalItem.set}
        collectorNumber={quoteModalItem.code}
        game={quoteModalItem.catalogSource === "scryfall" ? "magic" : "pokemon"}
        inventoryItemId={quoteModalItem.id}
        inventoryItemName={quoteModalItem.name}
        onClose={() => setQuoteModalItem(null)}
        onQuoteSaved={async () => {
          await load();
        }}
      />
    )}
  </>;
}
