"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
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

export function AutopilotView({
  initialQueue,
  initialRules,
  initialBatches,
}: {
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
    setLoading(true);
    try {
      const payload = applyAllSafe
        ? { channel, applyAllSafe: true, notes: `Autopilot: aprovação de todas as alterações seguras (${queue.safe.length} itens)` }
        : { channel, itemIds: Array.from(selectedIds), notes: `Aprovação manual de ${selectedIds.size} itens selecionados` };

      const res = await fetch("/api/autopilot/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
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
    setLoading(true);
    try {
      const res = await fetch("/api/autopilot/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, itemIds: [itemId], notes: "Aprovação individual" }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Erro ao aplicar.");
        return;
      }
      showToast("Preço atualizado!");
      await refreshData();
      router.refresh();
    } catch {
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
    displayedItems.length > 0 && displayedItems.every((item) => selectedIds.has(item.id));

  function toggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedItems.map((item) => item.id)));
    }
  }

  function toggleSelectItem(id: string) {
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
          <p className="eyebrow">COPILOTO OPERACIONAL DE PREÇOS</p>
          <h1>Autopilot de Preços e Margem</h1>
          <p>
            Automação segura com proteção de margem em BRL, travas contra saltos anômalos e arredondamento comercial.
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

      {/* Métricas do Autopilot */}
      <div className="metrics">
        <article className="metric">
          <div className="metric-icon green">
            <CheckCircle2 size={19} />
          </div>
          <div>
            <p>Alterações Seguras</p>
            <strong>{queue.stats.safeCount}</strong>
            <span className="positive">Prontas para Autopilot</span>
          </div>
        </article>

        <article className="metric">
          <div className="metric-icon amber">
            <SlidersHorizontal size={19} />
          </div>
          <div>
            <p>Travas Ativadas (Revisão)</p>
            <strong>{queue.stats.flaggedCount}</strong>
            <span>Oscilação &gt;15% ou margem</span>
          </div>
        </article>

        <article className="metric">
          <div className="metric-icon violet">
            <TrendingUp size={19} />
          </div>
          <div>
            <p>Margem Média Projetada</p>
            <strong>{queue.stats.averageProjectedMargin}%</strong>
            <span>Piso rentável garantido</span>
          </div>
        </article>

        <article className="metric">
          <div className="metric-icon violet">
            <Sparkles size={19} />
          </div>
          <div>
            <p>Impacto Financeiro Líquido</p>
            <strong>{money.format(queue.stats.potentialRevenueImpact)}</strong>
            <span>Estoque total potencial</span>
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
          <Zap size={16} /> Fila de Aprovação
          <span className="tab-count">{queue.safe.length + queue.flagged.length}</span>
        </button>

        <button
          type="button"
          className={`autopilot-tab ${activeTab === "rules" ? "active" : ""}`}
          onClick={() => setActiveTab("rules")}
        >
          <SlidersHorizontal size={16} /> Regras de Precificação
          <span className="tab-count">{rules.length}</span>
        </button>

        <button
          type="button"
          className={`autopilot-tab ${activeTab === "batches" ? "active" : ""}`}
          onClick={() => setActiveTab("batches")}
        >
          <History size={16} /> Histórico de Lotes & Rollback
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
          {channel === "counter" && queue.safe.length > 0 && (
            <div className="autopilot-banner">
              <div className="banner-info">
                <h3>⚡ {queue.safe.length} alterações seguras identificadas</h3>
                <p>
                  Todas respeitam a margem mínima e não ultrapassam a trava de variação máxima de 15%.
                </p>
              </div>
              <div className="banner-actions">
                <button
                  type="button"
                  className="btn-electric"
                  disabled={loading}
                  onClick={() => handleApplyBatch(true)}
                >
                  <Zap size={16} /> Aprovar todas ({queue.safe.length}) em 1 Clique
                </button>
              </div>
            </div>
          )}

          {/* Filtros e Busca */}
          <div className="filters" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Buscar por carta, coleção ou SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "280px" }}
              />

              <select
                value={queueFilter}
                onChange={(e) => setQueueFilter(e.target.value as typeof queueFilter)}
              >
                <option value="all">Todos os produtos ({queue.stats.totalItems})</option>
                <option value="safe">Somente Seguros ({queue.stats.safeCount})</option>
                <option value="flagged">Retidos / Suspeitos ({queue.stats.flaggedCount})</option>
                <option value="unchanged">Sem alteração ({queue.stats.unchangedCount})</option>
              </select>

              {channel === "counter" && selectedIds.size > 0 && (
                <button
                  type="button"
                  className="primary small"
                  disabled={loading}
                  onClick={() => handleApplyBatch(false)}
                >
                  <CheckCircle2 size={15} /> Aprovar {selectedIds.size} selecionados
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="secondary"
                disabled={loading || channel !== "counter"}
                onClick={handleRunAutomation}
                title="Executa as regras com Autopilot Seguro ativado"
              >
                <Sparkles size={15} /> Autopilot Automático
              </button>
              <button
                type="button"
                className="secondary"
                disabled={loading}
                onClick={refreshData}
                title="Recalcular referências de mercado e regras"
              >
                <RefreshCw size={15} /> Recalcular
              </button>
            </div>
          </div>

          {/* Tabela de Produtos */}
          <section className="panel products-panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "38px" }}>
                      <input
                        type="checkbox"
                        className="table-checkbox"
                        checked={isAllSelected}
                        disabled={channel !== "counter"}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>PRODUTO / DETALHES</th>
                    <th>PREÇO ATUAL</th>
                    <th>PISO MÍNIMO</th>
                    <th>MERCADO</th>
                    <th>SUGERIDO (AUTOPILOT)</th>
                    <th>VARIAÇÃO</th>
                    <th>MARGEM</th>
                    <th>STATUS DE SEGURANÇA</th>
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
                            disabled={channel !== "counter"}
                            onChange={() => toggleSelectItem(item.id)}
                          />
                        </td>
                        <td>
                          <div className="product-cell">
                            <div className="product-thumb thumb-3">
                              {item.name.slice(0, 2).toUpperCase()}
                            </div>
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
                          <span style={{ color: "#777c8e", fontSize: "12px" }}>
                            {money.format(item.minimumPrice)}
                          </span>
                        </td>
                        <td>
                          {item.marketPrice == null ? (
                            <span style={{ color: "#a5a8b7" }}>Sem cotação</span>
                          ) : (
                            money.format(item.marketPrice)
                          )}
                        </td>
                        <td>
                          <strong style={{ color: "var(--violet)", fontSize: "14px" }}>
                            {money.format(item.suggestedPrice)}
                          </strong>
                          {item.roundingMode !== "none" && (
                            <span style={{ display: "block", fontSize: "9px", color: "#8d87a5" }}>
                              arred. {item.roundingMode === "ends_90" ? ".90" : item.roundingMode}
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`diff ${
                              item.priceDifference > 0 ? "up" : item.priceDifference < 0 ? "down" : ""
                            }`}
                            style={{ display: "flex", alignItems: "center", gap: "2px" }}
                          >
                            {item.priceDifference > 0 ? (
                              <ArrowUpRight size={14} />
                            ) : item.priceDifference < 0 ? (
                              <ArrowDownRight size={14} />
                            ) : null}
                            {item.percentageChange >= 0 ? "+" : ""}
                            {item.percentageChange.toFixed(1)}%
                          </span>
                        </td>
                        <td>
                          <strong>{item.projectedMargin.toFixed(1)}%</strong>
                        </td>
                        <td>
                          <span
                            className={`safety-pill ${item.safetyStatus}`}
                            title={item.safetyFlag ?? item.safetyReason}
                          >
                            {item.safetyStatus === "safe_auto" && "✓ Seguro"}
                            {item.safetyStatus === "suspicious_flagged" && (
                              <>
                                ⚠{" "}
                                {item.safetyGate === "spike_threshold_exceeded"
                                  ? "Salto > 15%"
                                  : item.safetyGate === "margin_below_minimum"
                                    ? "Margem de Risco"
                                    : item.safetyGate === "missing_market_reference"
                                      ? "Sem Mercado"
                                      : "Revisão"}
                              </>
                            )}
                            {item.safetyStatus === "unchanged" && "Alinhado"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="row-action"
                            disabled={
                              loading ||
                              channel !== "counter" ||
                              Math.abs(item.priceDifference) < 0.01
                            }
                            onClick={() => handleApplySingle(item.id)}
                            style={{
                              background: isSafe ? "var(--violet-soft)" : "#f0f1f5",
                              color: isSafe ? "var(--violet)" : "#5a5e73",
                              padding: "6px 12px",
                              borderRadius: "7px",
                            }}
                          >
                            Aplicar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {displayedItems.length === 0 && (
                <div className="empty">
                  Nenhum produto encontrado na fila para os filtros selecionados.
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* TAB 2: REGRAS & ESTRATÉGIAS */}
      {activeTab === "rules" && (
        <>
          <div className="page-actions" style={{ justifyContent: "space-between", marginBottom: "18px" }}>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
              Estratégias específicas por jogo, acabamento (foil) e canal com proteção de piso e teto de oscilação.
            </p>
            <button
              type="button"
              className="primary small"
              onClick={() => {
                setEditingRule(null);
                setIsRuleModalOpen(true);
              }}
            >
              <Plus size={16} /> Nova Regra de Precificação
            </button>
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

                <div style={{ display: "flex", gap: "8px", marginTop: "auto", paddingTop: "8px" }}>
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
                </div>
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
                            disabled={loading}
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
