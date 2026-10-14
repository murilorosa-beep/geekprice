"use client";
import { useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";

type Preview = { valid: Record<string, unknown>[]; errors: { row: number; field?: string; message: string }[]; totalRows: number; hash: string; previewLimited: boolean };
export function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const router = useRouter(); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function inspect() { if (!file) return; setLoading(true); setError(""); const body = new FormData(); body.set("file", file);
    const response = await fetch("/api/imports/preview", { method: "POST", body }); const data = await response.json(); setLoading(false);
    if (!response.ok) return setError(data.error ?? "Falha ao analisar o arquivo."); setPreview(data);
  }
  async function commit() { if (!file || !preview) return; setLoading(true); const response = await fetch("/api/imports/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, hash: preview.hash, rows: preview.valid }) }); const data = await response.json(); setLoading(false);
    if (!response.ok) return setError(data.error ?? "Falha ao importar."); onClose(); router.refresh();
  }
  return <div className="drawer-layer" onMouseDown={onClose}><section className="import-modal" onMouseDown={(e) => e.stopPropagation()}><button className="drawer-close" onClick={onClose}><X /></button><p className="eyebrow">IMPORTAÇÃO SEGURA</p><h2>Importar estoque CSV</h2><p>Colunas: produto, categoria, sku, coleção, número, custo, preço, quantidade e margem.</p>
    <label className="file-drop"><FileSpreadsheet/><strong>{file?.name ?? "Escolha um arquivo CSV"}</strong><span>Máximo de 2 MB e 2.000 linhas</span><input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} /></label>
    {error && <div className="form-error">{error}</div>}
    {preview && <div className="preview-summary"><strong>{preview.totalRows} linhas analisadas</strong><span>{preview.valid.length} válidas · {preview.errors.length} erros</span>{preview.errors.slice(0, 5).map((item, index) => <p key={index}>Linha {item.row}{item.field ? ` (${item.field})` : ""}: {item.message}</p>)}</div>}
    {!preview ? <button className="primary full" disabled={!file || loading} onClick={inspect}><Upload size={17}/>{loading ? "Analisando..." : "Validar arquivo"}</button> : <button className="primary full" disabled={preview.errors.length > 0 || loading} onClick={commit}>{loading ? "Importando..." : `Importar ${preview.valid.length} itens`}</button>}
  </section></div>;
}
