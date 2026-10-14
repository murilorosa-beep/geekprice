"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import type { ImportPreviewResult } from "@/server/commerce/types";

type Connection = {
  id: string;
  kind: string;
  name: string;
  mode: string;
  active: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
};

type SyncRun = {
  id: string;
  connectionName: string;
  status: string;
  source: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  conflictCount: number;
  errorCount: number;
  startedAt: string;
  completedAt: string | null;
};

export function CommerceIntegrationManager({ canManage = true }: { canManage?: boolean }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal de Conexão
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [formName, setFormName] = useState("Loja WooCommerce Principal");
  const [formUrl, setFormUrl] = useState("");
  const [formKey, setFormKey] = useState("");
  const [formSecret, setFormSecret] = useState("");

  // Pré-visualização de Sincronização
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [confirmedProbable, setConfirmedProbable] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [resConn, resRuns] = await Promise.all([
        fetch("/api/integrations/connections"),
        fetch("/api/integrations/sync/runs"),
      ]);
      if (resConn.ok) {
        const data = await resConn.json();
        setConnections(data.connections || []);
      }
      if (resRuns.ok) {
        const data = await resRuns.json();
        setSyncRuns(data.runs || []);
      }
    } catch {
      setErrorMsg("Erro ao carregar conexões de integração.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setActionBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/integrations/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "woocommerce",
          name: formName,
          storeUrl: formUrl,
          consumerKey: formKey,
          consumerSecret: formSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao conectar.");

      setFeedback(
        data.testResult?.ok
          ? "Loja conectada e verificada com sucesso!"
          : "Loja cadastrada com pendência de verificação."
      );
      setShowConnectModal(false);
      setFormUrl("");
      setFormKey("");
      setFormSecret("");
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erro na conexão.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDisconnect(id: string) {
    if (!confirm("Tem certeza que deseja desconectar esta integração?")) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/integrations/connections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao desconectar.");
      setFeedback("Integração desconectada.");
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao desconectar.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStartSync(connectionId: string) {
    setActionBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    setPreview(null);
    setConfirmedProbable({});
    try {
      const res = await fetch("/api/integrations/sync/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao gerar pré-visualização do catálogo.");
      setPreview(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erro na prévia.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCommitSync() {
    if (!preview) return;
    setActionBusy(true);
    setErrorMsg(null);
    setFeedback(null);

    const probableMatchesList = Object.entries(confirmedProbable).map(([extId, invId]) => ({
      externalId: extId,
      inventoryItemId: invId,
    }));

    try {
      const res = await fetch("/api/integrations/sync/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionId: preview.connectionId,
          previewToken: preview.previewToken,
          confirmedProbableMatches: probableMatchesList,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao importar catálogo.");

      setFeedback(
        `Importação concluída! Novos produtos cadastrados: ${data.createdCount} | Produtos atualizados: ${data.updatedCount} | Conflitos/Pulados: ${data.skippedCount + data.conflictCount}`
      );
      setPreview(null);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erro na importação.");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <section className="panel" style={{ padding: 24, marginTop: 24 }} aria-label="Gerenciador de Integrações ERP e E-commerce">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Conexões Comerciais (ERP & E-commerce)</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.875rem" }}>
            Conecte seu e-commerce para importar produtos, sincronizar estoque e alimentar o motor de precificação em modo somente leitura.
          </p>
        </div>
        {canManage && (
          <button
            className="primary"
            disabled={actionBusy}
            onClick={() => setShowConnectModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={16} /> Conectar WooCommerce
          </button>
        )}
      </div>

      {feedback && (
        <div style={{ padding: 12, marginBottom: 16, backgroundColor: "rgba(16, 185, 129, 0.1)", border: "1px solid #10b981", borderRadius: 6, color: "#10b981" }}>
          {feedback}
        </div>
      )}

      {errorMsg && (
        <div style={{ padding: 12, marginBottom: 16, backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", borderRadius: 6, color: "#ef4444" }}>
          {errorMsg}
        </div>
      )}

      {/* Lista de Conexões Ativas */}
      {connections.length === 0 && !loading && (
        <div style={{ padding: 24, textAlign: "center", background: "var(--surface-raised, rgba(0,0,0,0.03))", borderRadius: 8 }}>
          <Clock size={32} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
          <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Nenhuma loja conectada</p>
          <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: 0 }}>
            Conecte sua loja WooCommerce para importar seu inventário de cartas, mangas e jogos automaticamente.
          </p>
        </div>
      )}

      {connections.length > 0 && (
        <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          {connections.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 16,
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong style={{ fontSize: "1rem" }}>{c.name}</strong>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      borderRadius: 12,
                      backgroundColor: c.active ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                      color: c.active ? "#10b981" : "#ef4444",
                    }}
                  >
                    {c.active ? "Ativa (Somente Leitura)" : "Inativa"}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
                  Tipo: WooCommerce REST API v3 · Última sincronização:{" "}
                  {c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString("pt-BR") : "Nunca"}
                </p>
              </div>

              {canManage && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="secondary"
                    disabled={actionBusy}
                    onClick={() => void handleStartSync(c.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.875rem" }}
                  >
                    <RefreshCw size={14} className={actionBusy ? "animate-spin" : ""} /> Sincronizar Catálogo
                  </button>
                  <button
                    className="ghost"
                    disabled={actionBusy}
                    onClick={() => void handleDisconnect(c.id)}
                    title="Desconectar"
                    style={{ color: "#ef4444", padding: 8 }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de Conexão WooCommerce */}
      {showConnectModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--surface, #1e293b)",
              borderRadius: 10,
              maxWidth: 520,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
            }}
          >
            <h3 style={{ margin: "0 0 8px" }}>Conectar Loja WooCommerce</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: "0 0 16px" }}>
              Gere chaves de API com permissão de <strong>Leitura (Read)</strong> em WooCommerce &gt; Configurações &gt; Avançado &gt; API REST no seu WordPress.
            </p>

            <form onSubmit={handleConnect} style={{ display: "grid", gap: 12 }}>
              <label className="field">
                <span>Nome de identificação</span>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Minha Loja Geek"
                />
              </label>

              <label className="field">
                <span>URL da Loja</span>
                <input
                  type="text"
                  required
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://minhaloja.com.br"
                />
              </label>

              <label className="field">
                <span>Consumer Key</span>
                <input
                  type="text"
                  required
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="ck_..."
                />
              </label>

              <label className="field">
                <span>Consumer Secret</span>
                <input
                  type="password"
                  required
                  value={formSecret}
                  onChange={(e) => setFormSecret(e.target.value)}
                  placeholder="cs_..."
                />
              </label>

              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--muted)",
                  backgroundColor: "rgba(0,0,0,0.2)",
                  padding: 8,
                  borderRadius: 4,
                }}
              >
                🔒 As credenciais são criptografadas em repouso (AES-256-GCM) no servidor e nunca expostas no navegador.
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={actionBusy}
                  onClick={() => setShowConnectModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary" disabled={actionBusy}>
                  {actionBusy ? "Verificando..." : "Salvar e Conectar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Painel de Pré-visualização e Conciliação */}
      {preview && (
        <div style={{ marginTop: 24, padding: 20, border: "1px solid var(--border)", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0 }}>Pré-visualização da Importação & Conciliação</h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "var(--muted)" }}>
                {preview.totalFetched} produtos identificados no WooCommerce. Revise a classificação automática antes de confirmar.
              </p>
            </div>
            <button
              className="primary"
              disabled={actionBusy}
              onClick={() => void handleCommitSync()}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <CheckCircle2 size={16} /> Confirmar Importação de Catálogo
            </button>
          </div>

          {/* Cards de Contagem */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 16 }}>
            <div style={{ padding: 10, borderRadius: 6, background: "rgba(16,185,129,0.1)", border: "1px solid #10b981", textAlign: "center" }}>
              <strong style={{ fontSize: "1.25rem", color: "#10b981" }}>{preview.exactMatches}</strong>
              <div style={{ fontSize: "0.75rem" }}>Correspondências Exatas</div>
            </div>
            <div style={{ padding: 10, borderRadius: 6, background: "rgba(59,130,246,0.1)", border: "1px solid #3b82f6", textAlign: "center" }}>
              <strong style={{ fontSize: "1.25rem", color: "#3b82f6" }}>{preview.newProducts}</strong>
              <div style={{ fontSize: "0.75rem" }}>Novos Produtos</div>
            </div>
            <div style={{ padding: 10, borderRadius: 6, background: "rgba(245,158,11,0.1)", border: "1px solid #f59e0b", textAlign: "center" }}>
              <strong style={{ fontSize: "1.25rem", color: "#f59e0b" }}>{preview.probableMatches}</strong>
              <div style={{ fontSize: "0.75rem" }}>Prováveis (Requer Confirmação)</div>
            </div>
            <div style={{ padding: 10, borderRadius: 6, background: "rgba(239,68,68,0.1)", border: "1px solid #ef4444", textAlign: "center" }}>
              <strong style={{ fontSize: "1.25rem", color: "#ef4444" }}>{preview.conflicts}</strong>
              <div style={{ fontSize: "0.75rem" }}>Conflitos de SKU</div>
            </div>
            <div style={{ padding: 10, borderRadius: 6, background: "rgba(156,163,175,0.1)", border: "1px solid #9ca3af", textAlign: "center" }}>
              <strong style={{ fontSize: "1.25rem", color: "#9ca3af" }}>{preview.insufficientData}</strong>
              <div style={{ fontSize: "0.75rem" }}>Dados Insuficientes</div>
            </div>
          </div>

          {/* Tabela de Itens Reconciliados */}
          <div style={{ maxHeight: 350, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "var(--surface-raised, rgba(0,0,0,0.05))" }}>
                  <th style={{ padding: "8px 12px" }}>Status</th>
                  <th style={{ padding: "8px 12px" }}>Produto Externo</th>
                  <th style={{ padding: "8px 12px" }}>SKU</th>
                  <th style={{ padding: "8px 12px" }}>Preço / Estoque</th>
                  <th style={{ padding: "8px 12px" }}>Ação / Vínculo</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map((item) => (
                  <tr key={item.externalId} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px" }}>
                      {item.status === "exact_match" && (
                        <span style={{ color: "#10b981", display: "flex", alignItems: "center", gap: 4 }}>
                          <CheckCircle2 size={14} /> Exato
                        </span>
                      )}
                      {item.status === "new_product" && (
                        <span style={{ color: "#3b82f6", display: "flex", alignItems: "center", gap: 4 }}>
                          <Plus size={14} /> Novo
                        </span>
                      )}
                      {item.status === "probable_match" && (
                        <span style={{ color: "#f59e0b", display: "flex", alignItems: "center", gap: 4 }}>
                          <HelpCircle size={14} /> Provável
                        </span>
                      )}
                      {item.status === "conflict" && (
                        <span style={{ color: "#ef4444", display: "flex", alignItems: "center", gap: 4 }}>
                          <XCircle size={14} /> Conflito
                        </span>
                      )}
                      {item.status === "insufficient_data" && (
                        <span style={{ color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}>
                          <AlertTriangle size={14} /> Incompleto
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <strong>{item.name}</strong>
                      {item.setName && (
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                          {item.setName} {item.collectorNumber ? `#${item.collectorNumber}` : ""}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{item.sku || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      {item.price ? `R$ ${item.price.toFixed(2)}` : "—"} · Qtd: {item.quantity}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: "0.8rem" }}>
                      {item.status === "exact_match" && (
                        <span style={{ color: "var(--muted)" }}>Atualizará estoque de &ldquo;{item.matchedProductName}&rdquo;</span>
                      )}
                      {item.status === "new_product" && (
                        <span style={{ color: "#3b82f6" }}>Cadastrará como novo item no estoque</span>
                      )}
                      {item.status === "probable_match" && (
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(confirmedProbable[item.externalId])}
                            onChange={(e) => {
                              if (e.target.checked && item.matchedInventoryItemId) {
                                setConfirmedProbable((prev) => ({
                                  ...prev,
                                  [item.externalId]: item.matchedInventoryItemId!,
                                }));
                              } else {
                                setConfirmedProbable((prev) => {
                                  const next = { ...prev };
                                  delete next[item.externalId];
                                  return next;
                                });
                              }
                            }}
                          />
                          <span>Vincular a &ldquo;{item.matchedProductName}&rdquo;</span>
                        </label>
                      )}
                      {item.status === "conflict" && <span style={{ color: "#ef4444" }}>{item.conflictDetails}</span>}
                      {item.status === "insufficient_data" && <span style={{ color: "#9ca3af" }}>{item.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Histórico Recente de Sincronizações */}
      {syncRuns.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: "1rem", margin: "0 0 8px" }}>Histórico de Sincronizações Recentes</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {syncRuns.slice(0, 5).map((run) => (
              <div
                key={run.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                  padding: "8px 12px",
                  background: "var(--surface-raised, rgba(0,0,0,0.02))",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}
              >
                <div>
                  <strong>{run.connectionName}</strong> ·{" "}
                  <span style={{ color: run.status === "success" ? "#10b981" : run.status === "partial" ? "#f59e0b" : "#ef4444" }}>
                    {run.status === "success" ? "Concluída" : run.status === "partial" ? "Parcial" : "Falha"}
                  </span>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    {new Date(run.startedAt).toLocaleString("pt-BR")}
                  </div>
                </div>
                <div style={{ textAlign: "right", color: "var(--muted)" }}>
                  +{run.createdCount} novos | {run.updatedCount} atualizados | {run.conflictCount + run.skippedCount} ignorados
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
