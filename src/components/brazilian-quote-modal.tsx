/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  HelpCircle,
  Loader2,
  Save,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import type { BrazilianQuoteItem, BrazilianQuoteResult } from "@/server/market/brazilian-sources";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function BrazilianQuoteModal({
  cardName,
  edition,
  collectorNumber,
  game = "pokemon",
  inventoryItemId,
  inventoryItemName,
  onClose,
  onQuoteSaved,
}: {
  cardName: string;
  edition?: string | null;
  collectorNumber?: string | null;
  game?: "pokemon" | "magic";
  inventoryItemId?: string | null;
  inventoryItemName?: string | null;
  onClose: () => void;
  onQuoteSaved?: () => void;
}) {
  const [nameQuery, setNameQuery] = useState(cardName);
  const [editionQuery, setEditionQuery] = useState(edition ?? "");
  const [numberQuery, setNumberQuery] = useState(collectorNumber ?? "");
  const [gameQuery, setGameQuery] = useState<"pokemon" | "magic">(game);
  const [loading, setLoading] = useState(true);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [data, setData] = useState<BrazilianQuoteResult | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      cardName: nameQuery.trim(),
      game: gameQuery,
    });
    if (editionQuery.trim()) params.set("edition", editionQuery.trim());
    if (numberQuery.trim()) params.set("number", numberQuery.trim());

    fetch(`/api/market/quote-br?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Não foi possível carregar as cotações.");
        if (active) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Erro ao consultar cotações.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [nameQuery, gameQuery, editionQuery, numberQuery]);

  async function handleManualSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!nameQuery.trim()) return;
    setLoading(true);
    setError("");
    setFeedback("");
    const params = new URLSearchParams({
      cardName: nameQuery.trim(),
      game: gameQuery,
      skipCache: "true",
    });
    if (editionQuery.trim()) params.set("edition", editionQuery.trim());
    if (numberQuery.trim()) params.set("number", numberQuery.trim());
    try {
      const res = await fetch(`/api/market/quote-br?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Não foi possível carregar as cotações.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar cotações.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveQuote(item: BrazilianQuoteItem, index: number) {
    if (!inventoryItemId) return;
    setSavingIndex(index);
    setError("");
    setFeedback("");

    const priceToRecord = item.priceAvg > 0 ? item.priceAvg : item.priceMin;

    try {
      const res = await fetch("/api/market/quote-br", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId,
          quote: {
            sourceLabel: item.sourceLabel,
            price: priceToRecord,
            url: item.url,
            edition: item.edition,
            collectorNumber: item.collectorNumber,
            cardTitle: item.cardTitle,
          },
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Falha ao gravar cotação no estoque.");
      }

      setFeedback(
        `✓ Cotação de ${money.format(priceToRecord)} (${item.sourceLabel}) gravada no estoque para "${inventoryItemName || cardName}"! O Autopilot já tem uma referência em BRL para precificação.`
      );
      if (onQuoteSaved) {
        onQuoteSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gravar cotação.");
    } finally {
      setSavingIndex(null);
    }
  }

  return (
    <div className="drawer-layer" onMouseDown={onClose} style={{ zIndex: 70 }}>
      <section
        className="modal-card"
        style={{
          width: "min(880px, calc(100vw - 32px))",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Cotações no mercado brasileiro"
      >
        <button
          type="button"
          className="drawer-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={20} />
        </button>

        <p className="eyebrow" style={{ color: "#10b981", display: "flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={14} /> MERCADO NACIONAL EM REAIS (BRL)
        </p>
        <h2 style={{ fontSize: "1.35rem", margin: "2px 0 6px 0" }}>
          Cotações Brasileiras: {cardName}
        </h2>
        <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
          Valores extraídos diretamente de fontes nacionais de referência (como Liga Pokémon e Liga Magic), permitindo precificar com base no mercado brasileiro real.
        </p>

        {/* Barra de Filtros / Ajuste de Busca */}
        <form
          className="filters"
          style={{ marginBottom: 18 }}
          onSubmit={handleManualSearch}
        >
          <input
            style={{ flex: 2, minWidth: 200 }}
            placeholder="Nome da carta"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
          />
          <input
            style={{ flex: 1, minWidth: 130 }}
            placeholder="Edição / Coleção"
            value={editionQuery}
            onChange={(e) => setEditionQuery(e.target.value)}
          />
          <input
            style={{ width: 100 }}
            placeholder="Nº"
            value={numberQuery}
            onChange={(e) => setNumberQuery(e.target.value)}
          />
          <select
            value={gameQuery}
            onChange={(e) => setGameQuery(e.target.value as "pokemon" | "magic")}
          >
            <option value="pokemon">Pokémon TCG</option>
            <option value="magic">Magic: The Gathering</option>
          </select>
          <button
            type="submit"
            className="primary small"
            disabled={loading || !nameQuery.trim()}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {loading ? "Buscando..." : "Atualizar Cotações"}
          </button>
        </form>

        {feedback && (
          <div
            className="feedback"
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#10b981",
              fontSize: "0.88rem",
              marginBottom: 16,
            }}
          >
            {feedback}
          </div>
        )}

        {error && (
          <div
            className="form-error"
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#ef4444",
              fontSize: "0.88rem",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Resumo de Preços (KPIs) */}
        {data && data.totalFound > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                padding: "14px 16px",
                borderRadius: 10,
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#10b981",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  textTransform: "uppercase",
                }}
              >
                <TrendingDown size={14} /> Menor Preço no Brasil
              </span>
              <strong style={{ fontSize: "1.45rem", display: "block", marginTop: 4 }}>
                {data.lowestPrice != null ? money.format(data.lowestPrice) : "—"}
              </strong>
              <small style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
                Menor anúncio registrado
              </small>
            </div>

            <div
              style={{
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.25)",
                padding: "14px 16px",
                borderRadius: 10,
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#6366f1",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  textTransform: "uppercase",
                }}
              >
                <Sparkles size={14} /> Preço Médio (Mediana)
              </span>
              <strong style={{ fontSize: "1.45rem", display: "block", marginTop: 4 }}>
                {data.medianPrice != null ? money.format(data.medianPrice) : "—"}
              </strong>
              <small style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
                Referência recomendada para venda
              </small>
            </div>

            <div
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                padding: "14px 16px",
                borderRadius: 10,
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#f59e0b",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  textTransform: "uppercase",
                }}
              >
                <TrendingUp size={14} /> Maior Preço
              </span>
              <strong style={{ fontSize: "1.45rem", display: "block", marginTop: 4 }}>
                {data.highestPrice != null ? money.format(data.highestPrice) : "—"}
              </strong>
              <small style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
                Teto de anúncios identificados
              </small>
            </div>
          </div>
        )}

        {/* Guia Rápido */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.07)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: "0.82rem",
            color: "var(--muted-foreground)",
          }}
        >
          <HelpCircle size={18} style={{ color: "#6366f1", flexShrink: 0 }} />
          <span>
            {inventoryItemId ? (
              <>
                Escolha a edição exata abaixo e clique em{" "}
                <strong>&quot;Gravar Cotação BRL no Estoque&quot;</strong> para vincular esta
                referência de preço diretamente à sua carta.
              </>
            ) : (
              <>
                Cotações obtidas em tempo real de lojas e anúncios ativos no Brasil.
              </>
            )}
          </span>
        </div>

        {/* Lista de Versões Encontradas */}
        {loading && !data ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--muted-foreground)",
            }}
          >
            <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            <p style={{ margin: 0 }}>Consultando cotações em reais na Liga Pokémon...</p>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div
            style={{
              padding: "36px 20px",
              textAlign: "center",
              background: "rgba(255, 255, 255, 0.02)",
              borderRadius: 10,
              border: "1px dashed rgba(255, 255, 255, 0.12)",
            }}
          >
            <p style={{ margin: "0 0 8px 0", fontSize: "0.95rem", fontWeight: 600 }}>
              Nenhuma cotação localizada para &quot;{nameQuery}&quot;
            </p>
            <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--muted-foreground)" }}>
              Dica: tente buscar pelo nome em inglês da carta ou ajuste a edição no campo de busca acima.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.items.map((item, idx) => {
              const targetPrice = item.priceAvg > 0 ? item.priceAvg : item.priceMin;
              const isSaving = savingIndex === idx;

              return (
                <div
                  key={`${item.url}-${idx}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "14px 18px",
                    borderRadius: 10,
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.07)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 260 }}>
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.cardTitle}
                        style={{
                          width: 44,
                          height: 60,
                          objectFit: "cover",
                          borderRadius: 4,
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                        }}
                        loading="lazy"
                      />
                    ) : (
                      <div
                        style={{
                          width: 44,
                          height: 60,
                          borderRadius: 4,
                          background: "rgba(255, 255, 255, 0.05)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "var(--muted-foreground)",
                        }}
                      >
                        TCG
                      </div>
                    )}

                    <div>
                      <strong style={{ fontSize: "0.95rem", display: "block" }}>
                        {item.cardTitle}
                      </strong>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--muted-foreground)",
                          display: "block",
                          marginTop: 2,
                        }}
                      >
                        {item.edition ? `Coleção: ${item.edition}` : "Edição avulsa"}
                        {item.collectorNumber ? ` · Nº ${item.collectorNumber}` : ""}
                      </span>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "0.72rem",
                          color: "#10b981",
                          background: "rgba(16, 185, 129, 0.1)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          marginTop: 4,
                        }}
                      >
                        {item.sourceLabel}
                      </span>
                    </div>
                  </div>

                  {/* Preços em BRL */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 20,
                    }}
                  >
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.7rem",
                          color: "var(--muted-foreground)",
                          textTransform: "uppercase",
                        }}
                      >
                        Mínimo
                      </span>
                      <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                        {item.priceMin > 0 ? money.format(item.priceMin) : "—"}
                      </span>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.7rem",
                          color: "#6366f1",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                      >
                        Médio (BRL)
                      </span>
                      <strong style={{ fontSize: "1.1rem", color: "#6366f1" }}>
                        {item.priceAvg > 0 ? money.format(item.priceAvg) : money.format(item.priceMin)}
                      </strong>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.7rem",
                          color: "var(--muted-foreground)",
                          textTransform: "uppercase",
                        }}
                      >
                        Máximo
                      </span>
                      <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                        {item.priceMax > 0 ? money.format(item.priceMax) : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="secondary small"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: "0.8rem",
                          textDecoration: "none",
                        }}
                        title="Ver página oficial do anúncio na Liga Pokémon"
                      >
                        Ver anúncio <ExternalLink size={12} />
                      </a>
                    )}

                    {inventoryItemId && (
                      <button
                        type="button"
                        className="primary small"
                        disabled={isSaving || targetPrice <= 0}
                        onClick={() => void handleSaveQuote(item, idx)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: "0.82rem",
                        }}
                      >
                        {isSaving ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        {isSaving ? "Gravando..." : `Gravar no Estoque (${money.format(targetPrice)})`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="form-actions" style={{ marginTop: 24 }}>
          <button type="button" className="secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </section>
    </div>
  );
}
