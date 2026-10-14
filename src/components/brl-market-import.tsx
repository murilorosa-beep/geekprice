"use client";

import { useState } from "react";
import { FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";

type Preview = {
  hash: string;
  previewToken: string | null;
  totalRows: number;
  valid: Array<Record<string, unknown>>;
  errors: Array<{ row: number; message: string }>;
};

export function BrlMarketImport() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file?: File) {
    setPreview(null);
    setMessage("");
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/market/partner-import/preview", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao validar CSV.");
      setPreview(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao validar CSV.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/market/partner-import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash: preview.hash, previewToken: preview.previewToken, rows: preview.valid }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao importar cotações.");
      setMessage(`✓ Sucesso! ${result.insertedObservations} nova(s) cotação(ões) BRL registrada(s). O Autopilot já pode usar estas referências.`);
      setPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao importar cotações.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ padding: 22, marginBottom: 24, borderTop: "3px solid #10b981" }} aria-label="Importação de Cotações BRL">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <FileSpreadsheet size={24} style={{ color: "#10b981", flexShrink: 0, marginTop: 2 }} />
        <div>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 4px 0" }}>Importar Cotações Nacionais em Reais (BRL)</h2>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            Suba uma planilha CSV com preços de concorrentes ou listas de distribuidores. O GeekPrice utilizará essas cotações para sugerir os melhores preços no <strong>Autopilot</strong> sem nunca deixar você vender abaixo do custo com lucro.
          </p>
        </div>
      </div>

      <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px dashed rgba(255, 255, 255, 0.15)", borderRadius: 8, padding: 18, marginTop: 12 }}>
        <label className="field" style={{ margin: 0 }}>
          <span style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6, display: "block" }}>
            Selecione o arquivo CSV (.csv):
          </span>
          <input
            aria-label="Arquivo CSV BRL"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => void upload(event.target.files?.[0])}
            style={{ fontSize: "0.85rem" }}
          />
        </label>
        <span style={{ display: "block", fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: 6 }}>
          Layout esperado: <code>produto, colecao, numero, idioma, condicao, acabamento, fonte, tipo_preco, moeda, valor, data_referencia</code>
        </span>
      </div>

      {busy && <p role="status" style={{ fontSize: "0.85rem", color: "#6366f1", marginTop: 10 }}>Processando arquivo...</p>}

      {preview && (
        <div style={{ marginTop: 16, background: "rgba(255, 255, 255, 0.03)", padding: 16, borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle2 size={18} style={{ color: "#10b981" }} />
            <strong style={{ fontSize: "0.95rem" }}>
              {preview.valid.length} de {preview.totalRows} linha(s) pronta(s) para importação
            </strong>
          </div>

          {preview.errors.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f59e0b", fontSize: "0.85rem", marginBottom: 4 }}>
                <AlertTriangle size={16} />
                <strong>Linhas com inconsistência ({preview.errors.length}):</strong>
              </div>
              {preview.errors.slice(0, 5).map((error, i) => (
                <p className="form-error" key={i} style={{ margin: "2px 0", fontSize: "0.8rem" }}>
                  Linha {error.row}: {error.message}
                </p>
              ))}
            </div>
          )}

          <ul style={{ margin: "8px 0 14px 18px", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            {preview.valid.slice(0, 4).map((row, i) => (
              <li key={i}>
                <strong>{String(row.productName)}</strong> — R$ {Number(row.price).toFixed(2)} ({String(row.sourceName)})
              </li>
            ))}
            {preview.valid.length > 4 && <li>...e mais {preview.valid.length - 4} item(ns).</li>}
          </ul>

          <button
            className="primary"
            disabled={busy || preview.errors.length > 0 || preview.valid.length === 0 || !preview.previewToken}
            onClick={() => void commit()}
          >
            Confirmar e Gravar {preview.valid.length} Cotação(ões) no Mercado
          </button>
        </div>
      )}

      {message && (
        <p role="status" style={{ marginTop: 12, fontSize: "0.9rem", color: message.startsWith("✓") ? "#10b981" : "#ef4444" }}>
          {message}
        </p>
      )}
    </section>
  );
}
