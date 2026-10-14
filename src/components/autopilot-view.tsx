/* eslint-disable @next/next/no-img-element -- Imagens dos catálogos externos associadas aos produtos. */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  History,
  Layers,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Store,
  TrendingUp,
  Undo2,
  Zap,
} from "lucide-react";
import type {
  AutopilotItemView,
  AutopilotQueueResult,
  PricingRuleRecord,
} from "@/server/autopilot/service";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const canApply = (item: AutopilotItemView) => item.cost > 0 && item.currentPrice > 0 && item.suggestedPrice > 0 && (item.marketPrice ?? 0) > 0 && item.safetyGate !== "margin_below_minimum" && Math.abs(item.priceDifference) >= 0.01;
const statusLabel = (item: AutopilotItemView) => {
  if (item.safetyGate === "missing_cost") return "Cadastre o custo";
  if (item.safetyGate === "missing_current_price") return "Cadastre o preço";
  if (item.safetyGate === "missing_market_reference") return "Sem cotação BRL";
  if (item.safetyGate === "spike_threshold_exceeded") return "Variação alta";
  if (item.safetyGate === "margin_below_minimum") return "Margem abaixo do mínimo";
  return item.safetyStatus === "unchanged" ? "Preço já alinhado" : "Pronto para revisão";
};

export function AutopilotView({
  canManagePrices,
  initialQueue,
  initialRules,
  initialBatches,
}: {
  canManagePrices: boolean;
  initialQueue: AutopilotQueueResult;
  initialRules: PricingRuleRecord[];
  initialBatches: Array<{
    id: string;
    source: string;
    channel: string;
    status: string;
    totalItems: number;
    totalValueBefore: number;
    totalValueAfter: number;
    revertedAt: Date | null;
    notes: string | null;
    createdAt: Date;
    createdByName: string | null;
  }>;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<"counter" | "ecommerce" | "marketplace">(
    initialQueue.channel
  );
  const [activeTab, setActiveTab] = useState<"queue" | "rules" | "batches">("queue");
  const [queueFilter, setQueueFilter] = useState<"all" | "safe" | "flagged" | "unchanged">("all");
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState(initialQueue);
  const [rules, setRules] = useState(initialRules);
  const [batches, setBatches] = useState(initialBatches);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Estado para modal de regra
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRuleRecord | null>(null);

  // Estados de carregamento e feedback
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [reviewItem, setReviewItem] = useState<AutopilotItemView | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // Troca de canal
  async function handleChannelChange(newChannel: "counter" | "ecommerce" | "marketplace") {
    setChannel(newChannel);
    setSelectedIds(new Set());
    setLoading(true);
    try {
      const res = await fetch(`/api/autopilot/queue?channel=${newChannel}`);
      if (res.ok) {
        const data = await res.json();
        setQueue(data);
      }
    } catch {
      showToast("Erro ao carregar fila do canal.");
    } finally {
      setLoading(false);
    }
  }

  // Recarregar dados
  async function refreshData() {
    setLoading(true);
    try {
      const [queueRes, rulesRes, batchesRes] = await Promise.all([
        fetch(`/api/autopilot/queue?channel=${channel}`),
        fetch("/api/pricing-rules"),
        fetch("/api/autopilot/batches"),
      ]);
      if (queueRes.ok) setQueue(await queueRes.json());
      if (rulesRes.ok) setRules(await rulesRes.json());
      if (batchesRes.ok) setBatches(await batchesRes.json());
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }

  // Aplicação em lote (Seguras ou Selecionadas)
  async function handleApplyBatch(applyAllSafe: boolean) {
    if (!canManagePrices) { setActionError("Seu acesso é de consulta. Peça a um administrador para aprovar mudanças de preço."); return; }
    const selected = queue.safe.filter((item) => canApply(item) && (applyAllSafe || selectedIds.has(item.id)));
    const count = selected.length;
    if (!count) { setActionError("Selecione ao menos um produto pronto para atualização."); return; }
    const preview = selected.slice(0, 8).map((item) => `${item.name}: ${money.format(item.currentPrice)} → ${money.format(item.suggestedPrice)}`).join("\n");
    if (!window.confirm(`Aplicar ${count} alteração(ões) no Balcão Físico?\n\n${preview}${count > 8 ? `\n...e mais ${count - 8} produto(s)` : ""}\n\nVocê poderá conferir o lote no histórico e desfazer se o preço não tiver sido alterado depois.`)) return;
    setActionError("");
    setLoading(true);
    try {
      const payload = applyAllSafe
        ? { channel, applyAllSafe: true, notes: `Autopilot: aprovação de todas as alterações seguras (${queue.safe.length} itens)` }
        : { channel, itemIds: selected.map((item) => item.id), notes: `Aprovação manual de ${selected.length} itens selecionados` };

      const res = await fetch("/api/autopilot/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Não foi possível aplicar os preços.");
        showToast(data.error ?? "Erro ao aplicar lote.");
        return;
      }
      showToast(`✓ ${data.message}`);
      await refreshData();
      router.refresh();
    } catch {
      showToast("Falha na comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  // Aplicação individual
  async function handleApplySingle(itemId: string) {
    if (!canManagePrices) { setActionError("Seu acesso é de consulta. Peça a um administrador para aprovar mudanças de preço."); return; }
    const item = [...queue.safe, ...queue.flagged].find((value) => value.id === itemId);
    if (!item || !canApply(item)) { setActionError("Este item ainda não está pronto: confira custo, preço atual e motivo da trava."); return; }
    if (item.safetyStatus === "suspicious_flagged" && !window.confirm(`Esta sugestão tem uma trava: ${item.safetyReason}\n\nAplicar mesmo assim no balcão físico?`)) return;
    setActionError("");
    setLoading(true);
    try {
      const res = await fetch("/api/autopilot/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, itemIds: [itemId], notes: "Aprovação individual" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Não foi possível aplicar o preço.");
        showToast(data.error ?? "Erro ao aplicar.");
        return;
      }
      setReviewItem(null);
      showToast("Preço atualizado!");
      await refreshData();
      router.refresh();
    } catch {
      setActionError("Falha de comunicação com o servidor. Tente novamente.");
      showToast("Falha ao aplicar alteração.");
    } finally {
      setLoading(false);
    }
  }

  // Rollback de lote
  async function handleRollbackBatch(batchId: string) {
    if (!confirm("Tem certeza que deseja reverter este lote? Os preços anteriores dos produtos serão restaurados.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/autopilot/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Erro ao desfazer lote.");
        return;
      }
      showToast(`✓ ${data.message}`);
      await refreshData();
      router.refresh();
    } catch {
      showToast("Erro ao executar rollback.");
    } finally {
      setLoading(false);
    }
  }

  // Executar automação periódica do Autopilot
  async function handleRunAutomation() {
    if (!canManagePrices) { setActionError("Somente administradores podem executar regras automáticas."); return; }
    if (!window.confirm("Executar agora as regras automáticas habilitadas? Produtos qualificados podem ter o preço do balcão alterado sem confirmação individual.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/autopilot/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Falha ao rodar automação.");
        return;
      }
      showToast("⚡ Autopilot executado com sucesso!");
      await refreshData();
      router.refresh();
    } catch {
      showToast("Erro ao rodar Autopilot.");
    } finally {
      setLoading(false);
    }
  }

  // Itens filtrados para a tabela
  const displayedItems = useMemo(() => {
    let list: AutopilotItemView[] = [];
    if (queueFilter === "safe") list = queue.safe;
    else if (queueFilter === "flagged") list = queue.flagged;
    else if (queueFilter === "unchanged") list = queue.unchanged;
    else list = [...queue.safe, ...queue.flagged, ...queue.unchanged];

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.set && item.set.toLowerCase().includes(q))
    );
  }, [queue, queueFilter, search]);

  // Manipulação de seleção
  const isAllSelected =
    displayedItems.some((item) => item.safetyStatus === "safe_auto" && canApply(item)) && displayedItems.filter((item) => item.safetyStatus === "safe_auto" && canApply(item)).every((item) => selectedIds.has(item.id));

  function toggleSelectAll() {
    if (!canManagePrices) return;
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedItems.filter((item) => item.safetyStatus === "safe_auto" && canApply(item)).map((item) => item.id)));
    }
  }

  function toggleSelectItem(id: string) {
    if (!canManagePrices) return;
    if (!displayedItems.some((item) => item.id === id && item.safetyStatus === "safe_auto" && canApply(item))) return;
    const updated = new Set(selectedIds);
    if (updated.has(id)) updated.delete(id);
    else updated.add(id);
    setSelectedIds(updated);
  }

  return (
    <div className="page-content">
      {/* Toast Feedback */}
      {toast && <div className="toast">{toast}</div>}

      {/* Cabeçalho */}
      <div className="page-title">
        <div>
          <p className="eyebrow">VENDA COM MAIS CLAREZA</p>
          <h1>Revisão de preços</h1>
          <p>
            Compare seu preço atual com a sugestão, entenda os alertas e decida o que aplicar no balcão.
          </p>
        </div>

        {/* Seletor de Canal */}
        <div className="autopilot-channels">
          <button
            type="button"
            className={`channel-pill ${channel === "counter" ? "active" : ""}`}
            onClick={() => handleChannelChange("counter")}
          >
            <Store size={16} /> Balcão Físico
          </button>
          <button
            type="button"
            className={`channel-pill ${channel === "ecommerce" ? "active" : ""}`}
            onClick={() => handleChannelChange("ecommerce")}
          >
            <Zap size={16} /> Loja Virtual
          </button>
          <button
            type="button"
            className={`channel-pill ${channel === "marketplace" ? "active" : ""}`}
            onClick={() => handleChannelChange("marketplace")}
          >
            <Layers size={16} /> Marketplace
          </button>
        </div>
      </div>

      <section className="seller-steps" aria-label="Como revisar preços">
        <div><span>01</span><strong>Cadastre o produto</strong><p>Confira custo e preço de venda em <Link href="/products">Produtos</Link>.</p></div>
        <div><span>02</span><strong>Consulte o mercado</strong><p>Vincule uma referência BRL em <Link href="/market">Mercado</Link> quando disponível.</p></div>
        <div><span>03</span><strong>Revise e confirme</strong><p>Veja o motivo da sugestão antes de mudar o preço no balcão.</p></div>
      </section>
      {actionError && <div className="autopilot-help" role="alert">{actionError}<button type="button" className="row-action" onClick={() => setActionError("")}>Fechar</button></div>}
      {!canManagePrices && <div className="autopilot-help">Você pode consultar sugestões e explicar os valores ao cliente. Apenas administradores da loja podem aplicar preços, editar regras ou desfazer alterações.</div>}

      {/* Métricas do Autopilot */}
      <div className="metrics">
        <article className="metric">
          <div className="metric-icon green">
            <CheckCircle2 size={19} />
          </div>
          <div>
            <p>Prontos para revisar</p>
            <strong>{queue.stats.safeCount}</strong>
            <span className="positive">Com dados para decisão</span>
          </div>
        </article>

        <article className="metric">
          <div className="metric-icon amber">
            <SlidersHorizontal size={19} />
          </div>
          <div>
            <p>Precisam de atenção</p>
            <strong>{queue.stats.flaggedCount}</strong>
            <span>Abra o item para ver o motivo</span>
          </div>
        </article>

        <article className="metric">
          <div className="metric-icon violet">
            <TrendingUp size={19} />
          </div>
          <div>
            <p>Margem média estimada</p>
            <strong>{queue.stats.safeCount > 0 ? `${queue.stats.averageProjectedMargin}%` : "—"}</strong>
            <span>{queue.stats.safeCount > 0 ? "Estimativa das sugestões" : "Aguardando dados completos"}</span>
          </div>
        </article>

        <article className="metric">
          <div className="metric-icon violet">
            <Sparkles size={19} />
          </div>
          <div>
            <p>Impacto potencial no estoque</p>
            <strong>{queue.stats.safeCount > 0 ? money.format(queue.stats.potentialRevenueImpact) : "—"}</strong>
            <span>{queue.stats.safeCount > 0 ? "Estimativa, não receita realizada" : "Aguardando sugestões seguras"}</span>
          </div>
        </article>
      </div>

      {/* Abas Principais */}
      <div className="autopilot-tabs">
        <button
          type="button"
          className={`autopilot-tab ${activeTab === "queue" ? "active" : ""}`}
          onClick={() => setActiveTab("queue")}
        >
          <Zap size={16} /> Sugestões de preço
          <span className="tab-count">{queue.safe.length + queue.flagged.length}</span>
        </button>

        <button
          type="button"
          className={`autopilot-tab ${activeTab === "rules" ? "active" : ""}`}
          onClick={() => setActiveTab("rules")}
        >
          <SlidersHorizontal size={16} /> Regras de preços
          <span className="tab-count">{rules.length}</span>
        </button>

        <button
          type="button"
          className={`autopilot-tab ${activeTab === "batches" ? "active" : ""}`}
          onClick={() => setActiveTab("batches")}
        >
          <History size={16} /> Histórico e desfazer
          <span className="tab-count">{batches.length}</span>
        </button>
      </div>

      {/* TAB 1: FILA DE APROVAÇÃO */}
      {activeTab === "queue" && (
        <>
          {channel !== "counter" && (
            <div className="autopilot-banner">
              <div className="banner-info">
                <h3>Canal em modo de simulação</h3>
                <p>
                  As sugestões podem ser analisadas, mas só serão publicadas após configurar
                  preços separados por canal e o respectivo integrador.
                </p>
              </div>
            </div>
          )}

          {/* Banner de Ação Rápida quando há itens seguros */}
          {channel === "counter" && canManagePrices && queue.safe.length > 0 && (
            <div className="autopilot-banner">
              <div className="banner-info">
                <h3>{queue.safe.length} {queue.safe.length === 1 ? "sugestão pronta" : "sugestões prontas"} para revisão</h3>
                <p>
                  Confira os valores antes de confirmar. A mudança afeta o preço do balcão físico, não publica preço em marketplaces.
                </p>
              </div>
              <div className="banner-actions">
                <button
                  type="button"
                  className="btn-electric"
                  disabled={loading}
                  onClick={() => handleApplyBatch(true)}
                >
                  <CheckCircle2 size={16} /> Revisar e confirmar {queue.safe.length}
                </button>
              </div>
            </div>
          )}

          {/* Filtros e Busca */}
          {queue.stats.totalItems > 0 && queue.stats.safeCount === 0 && (
            <div className="autopilot-help">Nenhum item está pronto para aplicação automática. Abra cada produto para ver o motivo. Custo ou preço zerado precisa ser corrigido em <Link href="/products">Produtos</Link>; referências ausentes podem ser vinculadas em <Link href="/market">Mercado</Link>.</div>
          )}
          <div className="filters" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Buscar carta, coleção ou SKU"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedIds(new Set()); }}
                style={{ width: "280px" }}
              />

              <select
                value={queueFilter}
                onChange={(e) => { setQueueFilter(e.target.value as typeof queueFilter); setSelectedIds(new Set()); }}
              >
                <option value="all">Todos os produtos ({queue.stats.totalItems})</option>
                <option value="safe">Prontos para revisar ({queue.stats.safeCount})</option>
                <option value="flagged">Precisam de atenção ({queue.stats.flaggedCount})</option>
                <option value="unchanged">Preço já alinhado ({queue.stats.unchangedCount})</option>
              </select>

              {channel === "counter" && canManagePrices && selectedIds.size > 0 && (
                <button
                  type="button"
                  className="primary small"
                  disabled={loading}
                  onClick={() => handleApplyBatch(false)}
                >
                  <CheckCircle2 size={15} /> Confirmar {selectedIds.size} selecionados
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="secondary"
                disabled={loading || channel !== "counter" || !canManagePrices}
                onClick={handleRunAutomation}
                title="Executa somente regras automáticas previamente habilitadas"
              >
                <Sparkles size={15} /> Executar regras automáticas
              </button>
              <button
                type="button"
                className="secondary"
                disabled={loading}
                onClick={refreshData}
                title="Atualizar sugestões e regras; não altera preços"
              >
                <RefreshCw size={15} /> Atualizar sugestões
              </button>
            </div>
          </div>

          {/* Tabela de Produtos */}
          <section className="panel products-panel seller-queue">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "38px" }}>
                      <input
                        type="checkbox"
                        className="table-checkbox"
                        checked={isAllSelected}
                        disabled={!canManagePrices || channel !== "counter" || !displayedItems.some((item) => item.safetyStatus === "safe_auto" && canApply(item))}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>CARTA / PRODUTO</th>
                    <th>PREÇO ATUAL</th>
                    <th>VALOR CALCULADO</th>
                    <th>POR QUÊ?</th>
                    <th style={{ textAlign: "right" }}>AÇÃO</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedItems.map((item) => {
                    const isSafe = item.safetyStatus === "safe_auto";
                    const isSelected = selectedIds.has(item.id);

                    return (
                      <tr key={item.id} style={{ background: isSelected ? "#f5f3ff" : undefined }}>
                        <td>
                          <input
                            type="checkbox"
                            className="table-checkbox"
                            checked={isSelected}
                            disabled={!canManagePrices || channel !== "counter" || !isSafe || !canApply(item)}
                            onChange={() => toggleSelectItem(item.id)}
                          />
                        </td>
                        <td>
                          <div className="product-cell">
                            {item.imageUrl && /^https:\/\//i.test(item.imageUrl) ? <img className="product-art" src={item.imageUrl} alt={`Carta ${item.name}`} loading="lazy"/> : <div className="product-art-placeholder">{item.name.slice(0, 2).toUpperCase()}</div>}
                            <div>
                              <strong>{item.name}</strong>
                              <span>
                                {item.sku} · {item.set ?? item.category}
                                {item.finish && item.finish !== "standard" && (
                                  <span className="tag-badge foil" style={{ marginLeft: "6px" }}>
                                    {item.finish}
                                  </span>
                                )}
                                {item.rarity && (
                                  <span className="tag-badge rare" style={{ marginLeft: "4px" }}>
                                    {item.rarity}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>{money.format(item.currentPrice)}</td>
                        <td>
                          <strong className="seller-suggested">{money.format(item.suggestedPrice)}</strong>
                          <span className="seller-delta">{item.marketPrice == null ? "Simulação por custo; não aplicável" : item.currentPrice <= 0 ? "Preço atual não cadastrado" : `${item.percentageChange >= 0 ? "+" : ""}${item.percentageChange.toFixed(1)}% em relação ao atual`}</span>
                        </td>
                        <td>
                          <span className={`safety-pill ${item.safetyStatus}`}>{statusLabel(item)}</span>
                          <span className="seller-reason">{item.safetyReason}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="row-action"
                            disabled={loading}
                            onClick={() => setReviewItem(item)}
                            style={{
                              background: isSafe ? "var(--violet-soft)" : "#f0f1f5",
                              color: isSafe ? "var(--violet)" : "#5a5e73",
                              padding: "6px 12px",
                              borderRadius: "7px",
                            }}
                          >
                            Ver detalhes
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {displayedItems.length === 0 && (
                <div className="empty" style={{ padding: "36px 20px" }}>
                  {queue.stats.totalItems === 0
                    ? "Sua fila do Autopilot está vazia no momento. Adicione cartas ao seu estoque pelo Catálogo ou cadastre produtos avulsos e vincule cotações na tela de Mercado para receber recomendações inteligentes de preço."
                    : "Nenhum produto encontrado na fila para os filtros selecionados."}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {reviewItem && <div className="drawer-layer" onMouseDown={() => setReviewItem(null)}><section className="modal-card seller-review" role="dialog" aria-modal="true" aria-label={`Revisão de preço de ${reviewItem.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="drawer-close" onClick={() => setReviewItem(null)} aria-label="Fechar revisão">×</button>
        <p className="eyebrow">DECISÃO DE PREÇO · BALCÃO FÍSICO</p>
        <div className="seller-review-heading">{reviewItem.imageUrl && /^https:\/\//i.test(reviewItem.imageUrl) ? <img className="product-art large" src={reviewItem.imageUrl} alt={`Carta ${reviewItem.name}`}/> : <div className="product-art-placeholder large">{reviewItem.name.slice(0, 2).toUpperCase()}</div>}<div><h2>{reviewItem.name}</h2><p>{reviewItem.set ?? reviewItem.category} · SKU {reviewItem.sku}</p><span className={`safety-pill ${reviewItem.safetyStatus}`}>{statusLabel(reviewItem)}</span></div></div>
        <div className="seller-review-prices"><div><span>Preço atual no estoque</span><strong>{money.format(reviewItem.currentPrice)}</strong></div><div><span>{reviewItem.marketPrice == null ? "Simulação por custo e margem" : "Sugestão com referência BRL"}</span><strong>{money.format(reviewItem.suggestedPrice)}</strong></div></div>
        <p className="seller-review-reason">{reviewItem.safetyReason}</p>
        <div className="seller-review-facts"><div><span>Custo de aquisição</span><strong>{money.format(reviewItem.cost)}</strong></div><div><span>Piso mínimo calculado</span><strong>{money.format(reviewItem.minimumPrice)}</strong></div><div><span>Referência BRL</span><strong>{reviewItem.marketPrice == null ? "Não disponível" : money.format(reviewItem.marketPrice)}</strong></div><div><span>Margem projetada</span><strong>{reviewItem.projectedMargin.toFixed(1)}%</strong></div></div>
        {reviewItem.marketPrice == null ? <p className="seller-review-warning">Este valor é apenas uma simulação matemática. Sem cotação brasileira recente, o Autopilot não altera seu preço — mesmo com confirmação manual. Seu preço atual permanece como está.</p> : reviewItem.safetyStatus === "suspicious_flagged" && <p className="seller-review-warning">Esta sugestão exige revisão humana. Não será aplicada automaticamente.</p>}
        <div className="seller-review-actions"><Link href="/products" className="secondary">Ver produtos</Link><Link href="/market" className="secondary">Ver mercado</Link>{reviewItem.marketPrice == null ? canManagePrices && <Link href={`/products?edit=${reviewItem.id}`} className="primary">Editar preço manualmente</Link> : <button type="button" className="primary" disabled={loading || !canManagePrices || channel !== "counter" || !canApply(reviewItem)} onClick={() => handleApplySingle(reviewItem.id)}>Alterar preço do estoque para {money.format(reviewItem.suggestedPrice)}</button>}</div>
        {channel !== "counter" && <p className="muted">Loja virtual e marketplace estão em modo de simulação; nenhum preço é publicado nesses canais.</p>}
        {!canApply(reviewItem) && channel === "counter" && <p className="muted">{reviewItem.marketPrice == null ? "Cadastre ou vincule uma referência BRL recente no Mercado para liberar uma sugestão aplicável. A referência internacional sozinha não libera alteração de preço." : "A aplicação fica disponível após corrigir os dados ou quando existir diferença real entre os preços."}</p>}
      </section></div>}

      {/* TAB 2: REGRAS & ESTRATÉGIAS */}
      {activeTab === "rules" && (
        <>
          <div className="page-actions" style={{ justifyContent: "space-between", marginBottom: "18px" }}>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
              Estratégias específicas por jogo, acabamento (foil) e canal com proteção de piso e teto de oscilação.
            </p>
            {canManagePrices && <button
              type="button"
              className="primary small"
              onClick={() => {
                setEditingRule(null);
                setIsRuleModalOpen(true);
              }}
            >
              <Plus size={16} /> Nova Regra de Precificação
            </button>}
          </div>

          <div className="rules-grid">
            {rules.map((rule) => (
              <div className="rule-card" key={rule.id}>
                <div className="rule-card-header">
                  <div>
                    <h3>{rule.name}</h3>
                    <span>
                      Canal: {rule.channel.toUpperCase()} · Prioridade: {rule.priority}
                    </span>
                  </div>
                  <span
                    className={`status ${rule.active ? "opportunity" : "healthy"}`}
                  >
                    {rule.active ? "Ativa" : "Inativa"}
                  </span>
                </div>

                <div className="rule-specs">
                  <div>
                    <span>Margem Mínima</span>
                    <strong>{Number(rule.minimumMarginPercent)}%</strong>
                  </div>
                  <div>
                    <span>Margem Desejada</span>
                    <strong>{Number(rule.desiredMarginPercent)}%</strong>
                  </div>
                  <div>
                    <span>Trava de Oscilação</span>
                    <strong>Máx ±{Number(rule.maxChangePercent)}%</strong>
                  </div>
                  <div>
                    <span>Desconto s/ Mercado</span>
                    <strong>{Number(rule.marketDiscountPercent)}%</strong>
                  </div>
                  <div>
                    <span>Taxa da Plataforma</span>
                    <strong>{Number(rule.feePercent)}%</strong>
                  </div>
                  <div>
                    <span>Arredondamento</span>
                    <strong>{rule.roundingMode}</strong>
                  </div>
                </div>

                <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                  {rule.category && <span>Jogo: {rule.category} · </span>}
                  {rule.finish && <span>Acabamento: {rule.finish} · </span>}
                  {rule.rarity && <span>Raridade: {rule.rarity} · </span>}
                  <span>
                    Autopilot Safe: {rule.autoApplySafe ? "✓ Ativado" : "Manual"}
                  </span>
                </div>

                {canManagePrices && <div style={{ display: "flex", gap: "8px", marginTop: "auto", paddingTop: "8px" }}>
                  <button
                    type="button"
                    className="secondary"
                    style={{ flex: 1, height: "32px", fontSize: "11px" }}
                    onClick={() => {
                      setEditingRule(rule);
                      setIsRuleModalOpen(true);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="secondary danger"
                    style={{ height: "32px", fontSize: "11px" }}
                    onClick={async () => {
                      if (!confirm(`Excluir regra "${rule.name}"?`)) return;
                      await fetch(`/api/pricing-rules/${rule.id}`, { method: "DELETE" });
                      showToast("Regra removida.");
                      refreshData();
                    }}
                  >
                    Excluir
                  </button>
                </div>}
              </div>
            ))}
          </div>

          {rules.length === 0 && (
            <div className="panel" style={{ padding: "40px", textAlign: "center" }}>
              <h3>Nenhuma regra customizada cadastrada</h3>
              <p style={{ color: "var(--muted)", fontSize: "13px" }}>
                O sistema está utilizando a Política Padrão da organização. Crie regras segmentadas para balcão, marketplace ou cartas foil.
              </p>
            </div>
          )}
        </>
      )}

      {/* TAB 3: HISTÓRICO DE LOTES & ROLLBACK */}
      {activeTab === "batches" && (
        <section className="panel products-panel">
          <div className="panel-title">
            <div>
              <h2>Histórico de Lotes Executados & Auditoria</h2>
              <p>Rastreabilidade completa de todas as alterações com reversão instantânea em 1 clique.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>DATA & HORA</th>
                  <th>OPERADOR</th>
                  <th>CANAL</th>
                  <th>ORIGEM</th>
                  <th>ITENS</th>
                  <th>VALOR ANTES</th>
                  <th>VALOR DEPOIS</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: "right" }}>AÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => {
                  const isReverted = batch.status === "reverted";
                  return (
                    <tr key={batch.id}>
                      <td>
                        <strong>
                          {new Date(batch.createdAt).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </strong>
                      </td>
                      <td>{batch.createdByName ?? "Autopilot Automático"}</td>
                      <td>
                        <span className="tag-badge rare">{batch.channel.toUpperCase()}</span>
                      </td>
                      <td>{batch.source}</td>
                      <td>
                        <strong>{batch.totalItems} produtos</strong>
                      </td>
                      <td>{money.format(batch.totalValueBefore)}</td>
                      <td>
                        <strong>{money.format(batch.totalValueAfter)}</strong>
                      </td>
                      <td>
                        <span className={`status ${isReverted ? "attention" : "opportunity"}`}>
                          {isReverted ? "Revertido" : "Aplicado"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {!isReverted ? (
                          <button
                            type="button"
                            className="secondary danger"
                            style={{ height: "32px", fontSize: "11px", display: "inline-flex", gap: "5px" }}
                            disabled={loading || !canManagePrices}
                            onClick={() => handleRollbackBatch(batch.id)}
                          >
                            <Undo2 size={13} /> Desfazer (Rollback)
                          </button>
                        ) : (
                          <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                            Revertido em{" "}
                            {batch.revertedAt
                              ? new Date(batch.revertedAt).toLocaleDateString("pt-BR")
                              : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {batches.length === 0 && (
              <div className="empty">
                Nenhum lote foi executado ainda. As atualizações em massa e automações aparecerão aqui.
              </div>
            )}
          </div>
        </section>
      )}

      {/* MODAL: CRIAR / EDITAR REGRA DE PRECIFICAÇÃO */}
      {isRuleModalOpen && (
        <div className="drawer-layer" onClick={() => setIsRuleModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "620px" }}>
            <h2>{editingRule ? "Editar Regra de Precificação" : "Nova Regra do Autopilot"}</h2>
            <p style={{ color: "var(--muted)", fontSize: "12px", marginBottom: "20px" }}>
              Configure parâmetros específicos de canal, proteção de margem e trava de oscilação.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                const formData = new FormData(e.currentTarget);
                const payload = {
                  name: formData.get("name") as string,
                  channel: formData.get("channel") as string,
                  category: (formData.get("category") as string) || null,
                  finish: (formData.get("finish") as string) || null,
                  rarity: (formData.get("rarity") as string) || null,
                  feePercent: Number(formData.get("feePercent")),
                  additionalCostPercent: Number(formData.get("additionalCostPercent")),
                  minimumMarginPercent: Number(formData.get("minimumMarginPercent")),
                  desiredMarginPercent: Number(formData.get("desiredMarginPercent")),
                  marketDiscountPercent: Number(formData.get("marketDiscountPercent")),
                  maxChangePercent: Number(formData.get("maxChangePercent")),
                  roundingMode: formData.get("roundingMode") as string,
                  autoApplySafe: formData.get("autoApplySafe") === "on",
                  priority: Number(formData.get("priority")),
                };

                try {
                  const url = editingRule
                    ? `/api/pricing-rules/${editingRule.id}`
                    : "/api/pricing-rules";
                  const method = editingRule ? "PUT" : "POST";
                  const res = await fetch(url, {
                    method,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    showToast(data.error ?? "Erro ao salvar regra.");
                    return;
                  }
                  showToast("Regra salva com sucesso!");
                  setIsRuleModalOpen(false);
                  refreshData();
                } catch {
                  showToast("Erro na requisição.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              <div className="form-grid">
                <label className="field wide">
                  Nome da Regra
                  <input
                    name="name"
                    required
                    placeholder="Ex: Pokémon Foil - Loja Virtual"
                    defaultValue={editingRule?.name ?? ""}
                  />
                </label>

                <label className="field">
                  Canal de Aplicação
                  <select name="channel" defaultValue={editingRule?.channel ?? channel}>
                    <option value="counter">Balcão Físico</option>
                    <option value="ecommerce">Loja Virtual (E-commerce)</option>
                    <option value="marketplace">Marketplaces (Shopee / Mercado Livre)</option>
                  </select>
                </label>

                <label className="field">
                  Jogo / Categoria (Opcional)
                  <input
                    name="category"
                    placeholder="Ex: Pokémon ou Magic"
                    defaultValue={editingRule?.category ?? ""}
                  />
                </label>

                <label className="field">
                  Acabamento (Opcional)
                  <input
                    name="finish"
                    placeholder="Ex: foil ou standard"
                    defaultValue={editingRule?.finish ?? ""}
                  />
                </label>

                <label className="field">
                  Raridade (Opcional)
                  <input
                    name="rarity"
                    placeholder="Ex: Secret Rare, Mythic"
                    defaultValue={editingRule?.rarity ?? ""}
                  />
                </label>

                <label className="field">
                  Taxas da Plataforma (%)
                  <input
                    type="number"
                    step="0.01"
                    name="feePercent"
                    required
                    defaultValue={Number(editingRule?.feePercent ?? 12)}
                  />
                </label>

                <label className="field">
                  Custos Adicionais (%)
                  <input
                    type="number"
                    step="0.01"
                    name="additionalCostPercent"
                    required
                    defaultValue={Number(editingRule?.additionalCostPercent ?? 0)}
                  />
                </label>

                <label className="field">
                  Margem Mínima Piso (%)
                  <input
                    type="number"
                    step="0.01"
                    name="minimumMarginPercent"
                    required
                    defaultValue={Number(editingRule?.minimumMarginPercent ?? 20)}
                  />
                </label>

                <label className="field">
                  Margem Desejada (%)
                  <input
                    type="number"
                    step="0.01"
                    name="desiredMarginPercent"
                    required
                    defaultValue={Number(editingRule?.desiredMarginPercent ?? 25)}
                  />
                </label>

                <label className="field">
                  Desconto s/ Mercado (%)
                  <input
                    type="number"
                    step="0.01"
                    name="marketDiscountPercent"
                    required
                    defaultValue={Number(editingRule?.marketDiscountPercent ?? 3)}
                  />
                </label>

                <label className="field">
                  Trava de Oscilação Máxima (%)
                  <input
                    type="number"
                    step="0.01"
                    name="maxChangePercent"
                    required
                    defaultValue={Number(editingRule?.maxChangePercent ?? 15)}
                  />
                </label>

                <label className="field">
                  Arredondamento Comercial
                  <select name="roundingMode" defaultValue={editingRule?.roundingMode ?? "ends_90"}>
                    <option value="ends_90">Terminados em ,90 (Psicológico)</option>
                    <option value="ends_99">Terminados em ,99</option>
                    <option value="round_integer">Inteiro (,00)</option>
                    <option value="none">Sem arredondamento (Exato)</option>
                  </select>
                </label>

                <label className="field">
                  Prioridade (1 a 100)
                  <input
                    type="number"
                    name="priority"
                    required
                    defaultValue={editingRule?.priority ?? 10}
                  />
                </label>

                <label className="field wide" style={{ flexDirection: "row", alignItems: "center", gap: "10px" }}>
                  <input
                    type="checkbox"
                    name="autoApplySafe"
                    defaultChecked={editingRule?.autoApplySafe ?? false}
                    className="table-checkbox"
                  />
                  <span>Aplicar alterações seguras automaticamente via Autopilot (Safe Auto-Apply)</span>
                </label>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setIsRuleModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar Regra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
