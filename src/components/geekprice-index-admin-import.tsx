"use client";

import { useState } from "react";

type Preview = { hash: string; totalRows: number; validRows: number; pricedRows: number; unpricedRows: number;
  errors: Array<{ row: number; message: string }>; preview: Array<{ game: string; name: string; setName: string;
    collectorNumber: string; priceMin: string | null; observedAt: string | null }>; previewToken: string | null };
const header = "game,name,canonical_id,set_name,set_code,collector_number,image_url,language,finish,condition,price_min_brl,provider_average_brl,price_max_brl,observed_at,source_url,source_external_id";

export function GeekPriceIndexAdminImport({ enabled }: { enabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceCode, setSourceCode] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceBaseUrl, setSourceBaseUrl] = useState("");
  const [acquisitionMethod, setAcquisitionMethod] = useState("authorized_csv");
  const [rightsReference, setRightsReference] = useState("");
  const [snapshotAt, setSnapshotAt] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function metadata() { return JSON.stringify({ sourceCode, sourceName, sourceBaseUrl, acquisitionMethod,
    rightsReference, sourceSnapshotAt: new Date(snapshotAt).toISOString() }); }
  async function submit(mode: "preview" | "commit") {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.append("file", file); form.append("metadata", metadata());
      if (mode === "commit" && preview?.previewToken) form.append("previewToken", preview.previewToken);
      const response = await fetch(`/api/geekprice-index/admin/import/${mode}`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao processar CSV.");
      if (mode === "preview") { setPreview(body); setMessage(body.errors.length ? "Corrija as linhas inválidas antes de importar." : "Prévia validada; confira a procedência e os números."); }
      else { setMessage(`Importação concluída: ${body.data.pricedRows} linhas com preço, ${body.data.unpricedRows} sem preço.`); setPreview(null); }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Falha ao processar CSV."); }
    finally { setBusy(false); }
  }
  return <section className="gi-admin-import panel"><div><p className="eyebrow">CARGA AUDITÁVEL</p><h2>Importar base com procedência</h2>
    <p>O arquivo pode conter preços históricos e impressões sem preço. A data observada de cada linha é preservada; nenhum valor ausente será estimado.</p></div>
    {!enabled && <p className="gi-stock-warning">Importação em banco desabilitada. A prévia funciona, mas o commit exige `INDEX_IMPORT_ENABLED=true` no banco local isolado.</p>}
    <div className="gi-admin-grid"><label>Arquivo CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); }} /></label>
      <label>Código da fonte<input required value={sourceCode} onChange={(event) => { setSourceCode(event.target.value); setPreview(null); }} placeholder="ex.: arquivo_parceiro_2026" /></label>
      <label>Nome da fonte<input required value={sourceName} onChange={(event) => { setSourceName(event.target.value); setPreview(null); }} /></label>
      <label>URL base HTTPS<input required type="url" value={sourceBaseUrl} onChange={(event) => { setSourceBaseUrl(event.target.value); setPreview(null); }} placeholder="https://fonte.example" /></label>
      <label>Método de aquisição<select value={acquisitionMethod} onChange={(event) => { setAcquisitionMethod(event.target.value); setPreview(null); }}><option value="authorized_csv">CSV autorizado</option>
        <option value="partner_export">Exportação de parceiro</option><option value="public_historical_archive">Arquivo histórico público</option></select></label>
      <label>Data do retrato<input required type="datetime-local" value={snapshotAt} onChange={(event) => { setSnapshotAt(event.target.value); setPreview(null); }} /></label>
      <label className="gi-admin-wide">Referência de direitos/procedência<input required value={rightsReference} onChange={(event) => { setRightsReference(event.target.value); setPreview(null); }} placeholder="URL pública com licença ou identificador do contrato/autorização" /></label></div>
    <p className="gi-admin-format">Cabeçalho obrigatório: <code>{header}</code></p>
    <div className="gi-stock-actions"><button className="secondary" type="button" disabled={busy || !file || !snapshotAt || !sourceCode || !sourceName || !sourceBaseUrl || !rightsReference}
      onClick={() => void submit("preview")}>Validar e ver prévia</button>
      <button className="primary" type="button" disabled={busy || !enabled || !preview?.previewToken || preview.errors.length > 0}
        onClick={() => void submit("commit")}>Importar lote validado</button></div>
    {message && <p role="status">{message}</p>}
    {preview && <div className="gi-admin-preview"><strong>{preview.totalRows} linhas · {preview.validRows} válidas · {preview.pricedRows} com preço · {preview.unpricedRows} sem preço · {preview.errors.length} erros exibidos</strong>
      {preview.errors.length > 0 && <ul>{preview.errors.map((error) => <li key={error.row}>Linha {error.row}: {error.message}</li>)}</ul>}
      <div className="gi-admin-sample">{preview.preview.map((row, index) => <div key={`${row.game}-${row.name}-${index}`}>{row.game} · {row.name} · {row.setName} · nº {row.collectorNumber} · {row.priceMin ? `mín. R$ ${row.priceMin}` : "sem preço"} · {row.observedAt ? new Date(row.observedAt).toLocaleDateString("pt-BR") : "—"}</div>)}</div>
    </div>}
  </section>;
}
