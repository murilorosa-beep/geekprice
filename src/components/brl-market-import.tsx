"use client";

import { useState } from "react";

type Preview = {
  hash: string; previewToken: string | null; totalRows: number;
  valid: Array<Record<string, unknown>>;
  errors: Array<{ row: number; message: string }>;
};

export function BrlMarketImport() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file?: File) {
    setPreview(null); setMessage("");
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/market/partner-import/preview", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao validar CSV.");
      setPreview(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao validar CSV."); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/market/partner-import/commit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash: preview.hash, previewToken: preview.previewToken, rows: preview.valid }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao importar referencias.");
      setMessage(`${result.insertedObservations} novas cotacoes BRL registradas. Referencias privadas da sua loja.`);
      setPreview(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao importar referencias."); }
    finally { setBusy(false); }
  }

  return <section className="panel" style={{ padding: 20, marginBottom: 20 }} aria-label="Importacao BRL">
    <h2>Importar referencias BRL</h2>
    <p>Envie cotacoes dos produtos ja cadastrados no seu estoque, com idioma, condicao e acabamento correspondentes. Elas ficam privadas e nao recebem verificacao de origem automaticamente. Apenas linhas do tipo referencia, dos ultimos 30 dias, entram na precificacao; anuncios e vendas informadas aparecem separadamente no Mercado.</p>
    <label className="field">Arquivo CSV BRL<input aria-label="Arquivo CSV BRL" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => void upload(event.target.files?.[0])} /></label>
    {busy && <p role="status">Processando...</p>}
    {preview && <div>
      <p>{preview.valid.length} de {preview.totalRows} linhas validas.</p>
      {preview.errors.slice(0, 10).map((error, i) => <p className="form-error" key={i}>Linha {error.row}: {error.message}</p>)}
      <ul>{preview.valid.slice(0, 5).map((row, i) => <li key={i}>{String(row.productName)} — R$ {Number(row.price).toFixed(2)} — {String(row.sourceName)}</li>)}</ul>
      <button className="primary" disabled={busy || preview.errors.length > 0 || preview.valid.length === 0 || !preview.previewToken} onClick={() => void commit()}>Confirmar importacao BRL</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
