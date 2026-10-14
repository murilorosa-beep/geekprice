/* eslint-disable @next/next/no-img-element -- URLs variam por carta no catálogo autorizado. */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MarketMyCards } from "@/components/market-my-cards";
import { BrlMarketImport } from "@/components/brl-market-import";
import { SmartRegistrationModal } from "@/components/smart-registration-modal";
import { BrazilianQuoteModal } from "@/components/brazilian-quote-modal";
import {
  AlertCircle,
  BookOpen,
  ChartNoAxesCombined,
  CheckCircle2,
  HelpCircle,
  Link2,
  Package,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

type Card = {
  id: string;
  name: string;
  localId: string | null;
  image: string | null;
  language: string;
};

type Detail = Card & {
  setName: string | null;
  rarity: string | null;
  prices: Array<{
    externalVariantId: string;
    sourceMarket: string;
    currency: string;
    price: number;
    finish: string;
  }>;
};

type Stock = {
  id: string;
  name: string;
  set: string | null;
  sku: string;
};

type Group = {
  inventoryItemId: string;
  productName: string;
  setName: string | null;
  collectorNumber: string | null;
  source: string;
  sourceType: string;
  sourceVerified: boolean;
  priceType: "listing" | "completed_sale" | "reference";
  currency: string;
  region: string;
  finish: string | null;
  min: number;
  median: number;
  max: number;
  count: number;
  lastUpdated: string;
  history: Array<{ price: number; referenceAt: string; source: string }>;
};

export function MarketExplorer({ canManage }: { canManage: boolean }) {
  const [activeTab, setActiveTab] = useState<"mine" | "catalog">("mine");
  const [registerCard, setRegisterCard] = useState<{ id: string; language: string } | null>(null);
  const [name, setName] = useState("");
  const [collection, setCollection] = useState("");
  const [number, setNumber] = useState("");
  const [language, setLanguage] = useState("pt-br");
  const [cards, setCards] = useState<Card[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stock, setStock] = useState<Stock[]>([]);
  const [stockId, setStockId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [currency, setCurrency] = useState("");
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [quoteModalData, setQuoteModalData] = useState<{ name: string; edition?: string | null; number?: string | null } | null>(null);
  const productsWithQuotes = Array.from(groups.reduce((byItem, quote) => {
    const existing = byItem.get(quote.inventoryItemId) ?? [];
    existing.push(quote);
    byItem.set(quote.inventoryItemId, existing);
    return byItem;
  }, new Map<string, Group[]>()).values());

  async function loadMarket() {
    const p = new URLSearchParams({ days });
    if (currency) p.set("currency", currency);
    const r = await fetch(`/api/market?${p}`);
    const b = await r.json();
    if (r.ok) setGroups(b.groups ?? []);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/inventory?pageSize=100").then((r) => r.json()),
      fetch(`/api/market?days=${days}`).then((r) => r.json()),
    ]).then(([i, m]) => {
      setStock(i.items ?? []);
      setGroups(m.groups ?? []);
    });
  }, [days]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDetail(null);
    const p = new URLSearchParams({ language });
    if (name) p.set("name", name);
    if (collection) p.set("set", collection);
    if (number) p.set("number", number);
    const r = await fetch(`/api/market/catalog?${p}`);
    const b = await r.json();
    setLoading(false);
    if (!r.ok) return setError(b.error ?? "Falha ao consultar o catálogo.");
    setCards(b.items ?? []);
  }

  async function select(c: Card) {
    setLoading(true);
    const r = await fetch(`/api/market/catalog/${encodeURIComponent(c.id)}?language=${language}`);
    const b = await r.json();
    setLoading(false);
    if (!r.ok) return setError(b.error ?? "Falha ao carregar a carta.");
    setDetail(b);
    setVariantId("");
  }

  async function link() {
    if (!detail || !stockId) return;
    setLoading(true);
    const r = await fetch("/api/market/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventoryItemId: stockId,
        externalCardId: detail.id,
        language,
        externalVariantId: variantId || undefined,
      }),
    });
    const b = await r.json();
    setLoading(false);
    if (!r.ok) return setError(b.error ?? "Não foi possível associar.");
    setFeedback(`✓ Edição associada ao estoque com ${b.observationsInserted ?? 0} nova(s) referência(s) internacional(is). Para liberar recomendação aplicável, ainda é necessária uma cotação brasileira recente em BRL.`);
    await loadMarket();
  }

  return (
    <div className="page-content">
      <div className="page-title">
        <div>
          <p className="eyebrow">INTELIGÊNCIA DE PREÇOS</p>
          <h1>Mercado</h1>
          <p>Veja suas cartas cadastradas, compare preços em reais e confirme a edição correta antes de decidir.</p>
        </div>
      </div>

      {feedback && <div className="feedback">{feedback}</div>}
      {error && <div className="form-error">{error}</div>}
      {registerCard && <SmartRegistrationModal
        initialCard={registerCard}
        onClose={() => setRegisterCard(null)}
        onCreated={async () => {
          const response = await fetch("/api/inventory?pageSize=100");
          const body = await response.json();
          if (response.ok) setStock(body.items ?? []);
          await loadMarket();
          setActiveTab("mine");
          setFeedback("Carta adicionada ao estoque com a edição escolhida. Confira seus detalhes e preço em Minhas cartas.");
        }}
      />}

      <div className="market-tabs" role="tablist" aria-label="Mercado">
        <button type="button" role="tab" aria-selected={activeTab === "mine"} className={activeTab === "mine" ? "active" : ""} onClick={() => setActiveTab("mine")}>Minhas cartas e preços</button>
        <button type="button" role="tab" aria-selected={activeTab === "catalog"} className={activeTab === "catalog" ? "active" : ""} onClick={() => setActiveTab("catalog")}>Buscar edição no catálogo</button>
      </div>
      {activeTab === "mine" ? <MarketMyCards canManage={canManage} onSearchEdition={(item) => { setStockId(item.id); setStock((current) => current.some((stockItem) => stockItem.id === item.id) ? current : [...current, { id: item.id, name: item.name, sku: item.sku, set: item.set }]); setName(item.name); setCollection(item.set ?? ""); setNumber(item.code ?? ""); setLanguage(item.language.toLowerCase()); setActiveTab("catalog"); setShowGuide(false); }}/> : <>

      {!showGuide && <div className="market-guide-summary"><HelpCircle size={18}/><span><strong>Para produtos manuais:</strong> encontre a edição exata, vincule ao estoque e veja as referências disponíveis. Referências em USD/EUR não liberam mudança de preço.</span><button type="button" className="secondary small" onClick={() => setShowGuide(true)}>Ver passo a passo</button></div>}
      {/* GUIA EXPLICATIVO PARA O LOJISTA */}
      {showGuide && (
        <section
          className="panel"
          style={{
            marginBottom: 24,
            padding: "18px 22px",
            borderLeft: "4px solid #6366f1",
            background: "rgba(99, 102, 241, 0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div style={{ display: "flex", gap: 14 }}>
              <HelpCircle size={24} style={{ color: "#6366f1", flexShrink: 0, marginTop: 2 }} />
              <div>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "1.05rem", fontWeight: 600 }}>
                  Como funciona o Mercado e a Associação:
                </h3>
                <p style={{ margin: "0 0 10px 0", fontSize: "0.9rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  No GeekPrice, você tem o <strong>Estoque</strong> (os produtos físicos que sua loja vende) e o <strong>Mercado</strong> (catálogo mundial com as cotações oficiais).
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 8 }}>
                  <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "#6366f1" }}>
                      <Search size={14} /> 1. Pesquise a Carta
                    </strong>
                    <span style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
                      Busque o nome oficial no catálogo Pokémon ou Magic abaixo.
                    </span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "#6366f1" }}>
                      <Link2 size={14} /> 2. Associe ao seu Produto
                    </strong>
                    <span style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
                      Diga ao sistema qual item do seu estoque corresponde a esta edição específica.
                    </span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "#6366f1" }}>
                      <CheckCircle2 size={14} /> 3. Deixe o Autopilot Sugerir
                    </strong>
                    <span style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
                      Com uma cotação brasileira recente em BRL, o Autopilot pode gerar uma sugestão aplicável. Sem ela, mostra apenas a simulação por custo.
                    </span>
                  </div>
                </div>
                <p style={{ margin: "12px 0 0 0", fontSize: "0.83rem", color: "#a5b4fc" }}>
                  💡 <strong>Dica de Ouro:</strong> Se você cadastrar cartas pelo menu <strong>Catálogo</strong>, a associação é feita automaticamente! Você só precisa usar esta tela se cadastrou um produto avulso em Produtos e quer vinculá-lo agora.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="secondary small"
              style={{ fontSize: "0.75rem", padding: "4px 8px", alignSelf: "flex-start", opacity: 0.7 }}
            >
              Ocultar guia
            </button>
          </div>
        </section>
      )}

      {/* PAINEL DE BUSCA DE CARTAS */}
      <section className="panel market-search">
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 4px 0" }}>1. Consultar Catálogo Mundial</h2>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Digite o nome da carta para encontrar as edições e cotações correspondentes.
          </p>
        </div>
        <form className="filters" onSubmit={search}>
          <input
            aria-label="Nome"
            placeholder="Nome da carta (ex: Pikachu, Charizard, Black Lotus)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            aria-label="Coleção"
            placeholder="Coleção (opcional)"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
          />
          <input
            aria-label="Número"
            placeholder="Número na coleção (opcional)"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="pt-br">Português</option>
            <option value="en">Inglês</option>
            <option value="es">Espanhol</option>
          </select>
          <button className="primary small" disabled={loading || (!name && !collection && !number)}>
            <Search size={16} />
            {loading ? "Consultando..." : "Buscar no catálogo"}
          </button>
        </form>
      </section>

      {/* RESULTADOS DA BUSCA */}
      {cards.length > 0 && (
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Resultados encontrados ({cards.length})</h2>
              <p>Clique sobre a carta com a ilustração/edição exata que você possui para associar ao seu estoque.</p>
            </div>
          </div>
          <div className="catalog-grid">
            {cards.map((c) => (
              <button key={c.id} className="catalog-card" onClick={() => select(c)}>
                {c.image ? <img src={c.image} alt="" /> : <span>{c.name.slice(0, 2)}</span>}
                <strong>{c.name}</strong>
                <small>{c.id} · nº {c.localId ?? "—"}</small>
                <small className="catalog-card-action">Ver edição e adicionar →</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* SEÇÃO DE ASSOCIAÇÃO DA CARTA SELECIONADA */}
      {detail && (
        <section className="panel detail-market" style={{ borderLeft: "4px solid #10b981" }}>
          <div>
            <p className="eyebrow" style={{ color: "#10b981" }}>EDIÇÃO SELECIONADA</p>
            {detail.image && <img className="market-selected-art" src={detail.image} alt={`Carta ${detail.name}`} />}
            <h2>{detail.name}</h2>
            <p style={{ margin: "4px 0 8px 0" }}>
              Coleção: <strong>{detail.setName ?? "Não informada"}</strong> · Número: <strong>{detail.localId ?? "—"}</strong> · Raridade: <strong>{detail.rarity ?? "Padrão"}</strong>
            </p>
            <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              {detail.prices.length
                ? `Possui ${detail.prices.length} cotações de mercado disponíveis nesta edição.`
                : "Sem cotações internacionais diretas cadastradas para esta edição específica."}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {canManage && <button type="button" className="primary small" onClick={() => setRegisterCard({ id: detail.id, language })}><Plus size={16}/> Adicionar esta edição ao meu estoque</button>}
              <button
                type="button"
                className="secondary small"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                onClick={() => setQuoteModalData({
                  name: detail.name,
                  edition: detail.setName,
                  number: detail.localId,
                })}
              >
                <Sparkles size={15} style={{ color: "#10b981" }} /> Cotação BR (Liga Pokémon)
              </button>
            </div>
          </div>

          {/* Se o estoque da loja estiver vazio, orienta o lojista com clareza */}
          {stock.length === 0 ? (
            <div
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: 8,
                padding: "16px 20px",
                maxWidth: 480,
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                <AlertCircle size={20} style={{ color: "#f59e0b", flexShrink: 0 }} />
                <strong style={{ color: "#f59e0b", fontSize: "0.95rem" }}>
                  Seu estoque está vazio (0 produtos)
                </strong>
              </div>
              <p style={{ fontSize: "0.85rem", margin: "0 0 12px 0", color: "var(--muted-foreground)", lineHeight: 1.4 }}>
                Para associar esta carta, é necessário ter itens cadastrados no estoque da sua loja. Você pode cadastrá-la diretamente agora com 1 clique:
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link
                  href="/catalog"
                  className="primary small"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                >
                  <Plus size={16} /> Cadastrar pelo Catálogo
                </Link>
                <Link
                  href="/products"
                  className="secondary small"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                >
                  <Package size={16} /> Ver Estoque
                </Link>
              </div>
            </div>
          ) : (
            <div className="link-fields" style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 440 }}>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: 4, display: "block" }}>
                  Qual item do seu estoque físico corresponde a esta carta?
                </label>
                <select
                  value={stockId}
                  onChange={(e) => setStockId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6 }}
                >
                  <option value="">Selecione o produto do seu estoque...</option>
                  {stock.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} (SKU: {i.sku}) {i.set ? `· ${i.set}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: 4, display: "block" }}>
                  Tipo de acabamento / cotação de referência:
                </label>
                <select
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6 }}
                >
                  <option value="">Todas as referências compatíveis</option>
                  {detail.prices.map((p) => (
                    <option key={p.externalVariantId} value={p.externalVariantId}>
                      {p.sourceMarket} · {p.finish} · {p.currency} {p.price.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="primary small"
                disabled={!stockId || loading}
                onClick={link}
                style={{ marginTop: 4, width: "100%" }}
              >
                <Link2 size={16} />
                {loading ? "Vinculando..." : "Vincular a este produto do estoque"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* SEÇÃO DE COTAÇÕES PERSISTIDAS NO BANCO */}
      <div className="page-title market-title" style={{ marginTop: 32 }}>
        <div>
          <h2>Cotações e Histórico Vinculado</h2>
          <p>Uma carta por bloco, com cotações separadas por moeda e acabamento. Valores internacionais não são preços de venda no Brasil.</p>
        </div>
        <div className="filters">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">Todas as moedas</option>
            <option>BRL</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
          <button className="secondary" onClick={loadMarket}>
            Filtrar
          </button>
        </div>
      </div>

      {productsWithQuotes.length ? (
        <div className="market-groups">
          {productsWithQuotes.map((quotes) => (
            <section
              className="panel market-group"
              key={quotes[0].inventoryItemId}
            >
              <div className="market-product-heading">
                <strong>{quotes[0].productName}</strong>
                <span>
                  {quotes[0].setName ?? "Sem coleção"} · {quotes[0].collectorNumber ?? "sem número"} · {quotes.length} {quotes.length === 1 ? "cotação" : "cotações"}
                </span>
              </div>
              <div className="market-quotes">{quotes.map((g, n) => <div className="market-quote" key={n}>
              <strong className="market-quote-label">{g.currency} · {g.finish || "padrão"} · {g.source}</strong>
              <div className="market-stats">
                <span>
                  Mínimo<strong>{g.currency} {g.min.toFixed(2)}</strong>
                </span>
                <span>
                  Mediana<strong>{g.currency} {g.median.toFixed(2)}</strong>
                </span>
                <span>
                  Intervalo<strong>{g.min.toFixed(2)}–{g.max.toFixed(2)}</strong>
                </span>
                <span>
                  Fonte<strong>{g.source}</strong>
                </span>
              </div>
              <p className="market-note">
                {g.region === "BR"
                  ? "Mercado brasileiro (BRL)"
                  : "Referência internacional (não representa preço direto praticado no Brasil)"}
                {" · "}
                {g.sourceVerified
                  ? "Fonte verificada"
                  : g.sourceType === "private"
                  ? "Fonte privada não verificada"
                  : "Fonte não verificada"}
                {" · "}
                {g.priceType === "completed_sale"
                  ? "Venda informada"
                  : g.priceType === "listing"
                  ? "Preço anunciado"
                  : "Referência informada"}
                {" · "}
                {g.count} observação(ões) · {new Date(g.lastUpdated).toLocaleString("pt-BR")}
              </p>
              {g.history.length >= 2 ? (
                <div className="history-list">
                  {g.history.map((p) => (
                    <span key={`${p.referenceAt}-${p.price}`}>
                      {new Date(p.referenceAt).toLocaleDateString("pt-BR")}{" "}
                      <strong>
                        {g.currency} {p.price.toFixed(2)}
                      </strong>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: "0.8rem", margin: "6px 0 0 0" }}>
                  Histórico de variação disponível após observações em duas datas diferentes.
                </p>
              )}
              </div>)}</div>
            </section>
          ))}
        </div>
      ) : (
        <section className="panel notice-card" style={{ padding: "36px 24px", textAlign: "center" }}>
          <ChartNoAxesCombined size={42} style={{ color: "var(--muted-foreground)", marginBottom: 12 }} />
          <h2 style={{ fontSize: "1.2rem", margin: "0 0 6px 0" }}>Nenhuma cotação vinculada ao estoque ainda</h2>
          <p style={{ maxWidth: 540, margin: "0 auto 18px auto", color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1.5 }}>
            O histórico de mercado e os comparativos de preço aparecem aqui quando você cadastra cartas pelo <strong>Catálogo</strong>, vincula cartas existentes na busca acima, ou importa uma planilha de cotações em BRL.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/catalog" className="primary small" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <BookOpen size={16} /> Cadastrar Cartas pelo Catálogo
            </Link>
            <Link href="/products" className="secondary small" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <Package size={16} /> Gerenciar Estoque
            </Link>
          </div>
        </section>
      )}
      {canManage && <BrlMarketImport />}
      </>}
      {quoteModalData && (
        <BrazilianQuoteModal
          cardName={quoteModalData.name}
          edition={quoteModalData.edition}
          collectorNumber={quoteModalData.number}
          inventoryItemId={stockId || null}
          inventoryItemName={stock.find((s) => s.id === stockId)?.name}
          onClose={() => setQuoteModalData(null)}
          onQuoteSaved={loadMarket}
        />
      )}
    </div>
  );
}
