/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  HelpCircle,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
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

  async function handleManualSearch(e?: React.FormEvent, forceSkipCache = false) {
    if (e) e.preventDefault();
    if (!nameQuery.trim()) return;
    setLoading(true);
    setError("");
    setFeedback("");

    const params = new URLSearchParams({
      cardName: nameQuery.trim(),
      game: gameQuery,
    });
    if (editionQuery.trim()) params.set("edition", editionQuery.trim());
    if (numberQuery.trim()) params.set("number", numberQuery.trim());
    if (forceSkipCache) params.set("skipCache", "true");

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
            token: item.token,
            observedAt: item.observedAt,
          },
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Falha ao gravar cotação no estoque.");
      }

      setFeedback(
        `✓ Cotação de ${money.format(priceToRecord)} (${item.sourceLabel}) vinculada como referência não-homologada para "${inventoryItemName || cardName}". Para sua segurança financeira, o Autopilot manterá qualquer sugestão dependente de aprovação manual.`
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
          Referências em BRL da API MYP Cards, quando configurada. Valores são ofertas disponíveis e qualquer sugestão continua exigindo aprovação manual.
        </p>

        {/* Barra de Filtros / Ajuste de Busca */}
        <form
          className="filters"
          style={{ marginBottom: 14 }}
          onSubmit={(e) => handleManualSearch(e, false)}
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
            {loading ? "Buscando..." : "Consultar"}
          </button>
          <button
            type="button"
            className="secondary small"
            disabled={loading || !nameQuery.trim()}
            onClick={() => handleManualSearch(undefined, true)}
            title="Ignora o cache e busca diretamente na fonte externa"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <RefreshCw size={14} /> Ao vivo
          </button>
        </form>

        {/* Proveniência e Selos de Auditoria */}
        {data && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            {data.status === "ok" && data.fromCache ? (
              <span
                style={{
                  fontSize: "0.75rem",
                  background: "rgba(99, 102, 241, 0.12)",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  color: "#a5b4fc",
                  padding: "4px 8px",
                  borderRadius: 6,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Clock size={12} /> Cotação em Cache (coletada em{" "}
                {new Date(data.collectedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})
              </span>
            ) : data.status === "ok" ? (
              <span
                style={{
                  fontSize: "0.75rem",
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  color: "#10b981",
                  padding: "4px 8px",
                  borderRadius: 6,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Sparkles size={12} /> Coleta Recente (ao vivo)
              </span>
            ) : null}

            {data.status === "ok" && <span
              style={{
                fontSize: "0.75rem",
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                color: "#f59e0b",
                padding: "4px 8px",
                borderRadius: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <ShieldAlert size={12} /> Fonte Externa Não-Homologada
            </span>}

            {data.statsScope === "targeted_edition" && data.targetEdition && (
              <span
                style={{
                  fontSize: "0.75rem",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "var(--muted-foreground)",
                  padding: "4px 8px",
                  borderRadius: 6,
                }}
              >
                Estatísticas isoladas da coleção: {data.targetEdition}
              </span>
            )}
          </div>
        )}

        {/* Mensagem de Feedback de Sucesso */}
        {feedback && (
          <div
            className="feedback"
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#10b981",
              fontSize: "0.85rem",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {feedback}
          </div>
        )}

        {/* Mensagens de Erro e Diagnóstico */}
        {error && (
          <div
            className="form-error"
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#ef4444",
              fontSize: "0.85rem",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Alerta de Status Especial (Bloqueio, Rede, Layout, Comercial) */}
        {data && data.status !== "ok" && (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: 8,
              marginBottom: 18,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              background:
                data.status === "source_blocked"
                  ? "rgba(239, 68, 68, 0.08)"
                  : data.status === "disabled_for_commercial" || data.status === "access_pending" || data.status === "invalid_token"
                    ? "rgba(99, 102, 241, 0.08)"
                    : "rgba(245, 158, 11, 0.08)",
              border:
                data.status === "source_blocked"
                  ? "1px solid rgba(239, 68, 68, 0.3)"
                  : data.status === "disabled_for_commercial" || data.status === "access_pending" || data.status === "invalid_token"
                    ? "1px solid rgba(99, 102, 241, 0.3)"
                    : "1px solid rgba(245, 158, 11, 0.3)",
            }}
          >
            <AlertTriangle
              size={20}
              style={{
                color:
                  data.status === "source_blocked"
                    ? "#ef4444"
                    : data.status === "disabled_for_commercial"
                      ? "#6366f1"
                      : "#f59e0b",
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <div>
              <strong style={{ fontSize: "0.9rem", display: "block" }}>
                {data.status === "source_blocked"
                  ? "Acesso bloqueado pela plataforma externa"
                  : data.status === "network_error"
                    ? "Falha de comunicação de rede"
                    : data.status === "html_layout_changed"
                      ? "Formato da página externa alterado"
                  : data.status === "disabled_for_commercial" || data.status === "access_pending"
                    ? "Acesso à fonte pendente"
                    : data.status === "invalid_token"
                      ? "Credencial da fonte recusada"
                      : data.status === "rate_limited"
                        ? "Limite da fonte atingido"
                        : "Nenhuma cotação localizada"}
              </strong>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.83rem", color: "var(--muted-foreground)" }}>
                {data.statusMessage}
              </p>
              {data.status === "access_pending" && (
                <p style={{ margin: "8px 0 0 0", fontSize: "0.8rem", color: "#a5b4fc" }}>
                  💡 Enquanto o acesso à API aguarda aprovação, você ainda pode registrar referências próprias pelo <strong>CSV BRL</strong>, sempre identificadas como fonte privada e com aprovação manual.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Resumo de Preços (KPIs) com cálculo estrito por edição */}
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
                <TrendingDown size={14} /> Menor Preço Anunciado
              </span>
              <strong style={{ fontSize: "1.45rem", display: "block", marginTop: 4 }}>
                {data.lowestPrice != null ? money.format(data.lowestPrice) : "—"}
              </strong>
              <small style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
                Piso de ofertas ativas
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
                <Sparkles size={14} /> Média / Mediana
              </span>
              <strong style={{ fontSize: "1.45rem", display: "block", marginTop: 4 }}>
                {data.medianPrice != null ? money.format(data.medianPrice) : "—"}
              </strong>
              <small style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
                Referência ponderada (não é venda)
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
                Teto de anúncios na coleção
              </small>
            </div>
          </div>
        )}

        {/* Guia e Regras de Segurança */}
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
                Apenas cotações autenticadas com <strong>assinatura do servidor</strong> e com correspondência exata de <strong>coleção e número</strong> podem ser vinculadas ao seu estoque.
              </>
            ) : (
              <>
                Valores informativos de mercado brasileiro. Para uso automatizado, homologue parceiros ou importe listas privadas.
              </>
            )}
          </span>
        </div>

        {/* Lista de Versões Encontradas Segmentadas por Edição */}
        {loading && !data ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--muted-foreground)",
            }}
          >
            <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            <p style={{ margin: 0 }}>Consultando cotações com validação do servidor...</p>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {data.byEdition.map((group) => (
              <div
                key={group.edition}
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: 10,
                  padding: "14px 16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                    paddingBottom: 8,
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "0.95rem" }}>Coleção: {group.edition}</strong>
                    <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginLeft: 8 }}>
                      ({group.count} opção(ões))
                    </span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                    Média desta coleção:{" "}
                    <strong style={{ color: "#6366f1" }}>
                      {group.medianPrice != null ? money.format(group.medianPrice) : "—"}
                    </strong>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.items.map((item, idx) => {
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
                          padding: "10px 14px",
                          borderRadius: 8,
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.04)",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 240 }}>
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.cardTitle}
                              style={{
                                width: 40,
                                height: 56,
                                objectFit: "cover",
                                borderRadius: 4,
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                              }}
                              loading="lazy"
                            />
                          ) : (
                            <div
                              style={{
                                width: 40,
                                height: 56,
                                borderRadius: 4,
                                background: "rgba(255, 255, 255, 0.05)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                color: "var(--muted-foreground)",
                              }}
                            >
                              TCG
                            </div>
                          )}

                          <div>
                            <strong style={{ fontSize: "0.9rem", display: "block" }}>
                              {item.cardTitle}
                            </strong>
                            <span
                              style={{
                                fontSize: "0.78rem",
                                color: "var(--muted-foreground)",
                                display: "block",
                                marginTop: 2,
                              }}
                            >
                              {item.collectorNumber ? `Nº ${item.collectorNumber}` : "Sem nº definido"}
                            </span>
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: "0.7rem",
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
                            gap: 16,
                          }}
                        >
                          <div style={{ textAlign: "right" }}>
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.68rem",
                                color: "var(--muted-foreground)",
                                textTransform: "uppercase",
                              }}
                            >
                              Mínimo
                            </span>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                              {item.priceMin > 0 ? money.format(item.priceMin) : "—"}
                            </span>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.68rem",
                                color: "#6366f1",
                                textTransform: "uppercase",
                                fontWeight: 600,
                              }}
                            >
                              Médio (BRL)
                            </span>
                            <strong style={{ fontSize: "1.05rem", color: "#6366f1" }}>
                              {item.priceAvg > 0 ? money.format(item.priceAvg) : money.format(item.priceMin)}
                            </strong>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.68rem",
                                color: "var(--muted-foreground)",
                                textTransform: "uppercase",
                              }}
                            >
                              Máximo
                            </span>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
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
                                fontSize: "0.78rem",
                                textDecoration: "none",
                              }}
                              title="Ver anúncio na Liga Pokémon"
                            >
                              Ver anúncio <ExternalLink size={12} />
                            </a>
                          )}

                          {inventoryItemId && (
                            <button
                              type="button"
                              className="primary small"
                              disabled={isSaving || targetPrice <= 0 || !item.token}
                              onClick={() => void handleSaveQuote(item, idx)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: "0.8rem",
                              }}
                            >
                              {isSaving ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Save size={14} />
                              )}
                              {isSaving ? "Validando..." : `Vincular (${money.format(targetPrice)})`}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
