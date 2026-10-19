"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { collectionCategories, collectionStatuses, type CollectionInput } from "@/lib/geek-workspace";
import { Field, saveWorkspace, WorkspaceDialog } from "./shared";
type Item = CollectionInput & { id: string; version: number };
const empty: CollectionInput = { title: "", category: "manga", series: "", edition: "", status: "owned", quantity: 1, purchasePrice: "0", purchasedAt: "", imageUrl: "", location: "", borrower: "", loanDueAt: "", notes: "" };
export function CollectionEditor({ item, onClose, onSaved }: { item?: Item; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CollectionInput>(item ? { ...item } : empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function field<K extends keyof CollectionInput>(key: K, value: CollectionInput[K]) { setForm((prev) => ({ ...prev, [key]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await saveWorkspace("/api/collections", form, item); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <WorkspaceDialog title={item ? "Editar item da coleção" : "Um novo item na sua história"} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit}><div className="gw-form-grid">
    <Field label="Título *" wide><input required minLength={2} maxLength={240} value={form.title} onChange={(e) => field("title", e.target.value)} placeholder="Ex.: One Piece — volume 1"/></Field>
    <Field label="Categoria"><select value={form.category} onChange={(e) => field("category", e.target.value as CollectionInput["category"])}>{Object.entries(collectionCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
    <Field label="Situação"><select value={form.status} onChange={(e) => field("status", e.target.value as CollectionInput["status"])}>{Object.entries(collectionStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
    <Field label="Série / franquia"><input maxLength={180} value={form.series} onChange={(e) => field("series", e.target.value)} placeholder="Ex.: One Piece"/></Field>
    <Field label="Volume / edição / versão"><input maxLength={100} value={form.edition} onChange={(e) => field("edition", e.target.value)} placeholder="Ex.: Vol. 01 · edição brasileira"/></Field>
    <Field label="Quantidade"><input required type="number" min="1" max="100000" value={form.quantity} onChange={(e) => field("quantity", Number(e.target.value))}/></Field>
    <Field label={form.status === "wishlist" ? "Preço planejado por unidade (R$)" : "Custo por unidade (R$)"}><input required type="number" min="0" max="99999999.99" step="0.01" value={form.purchasePrice} onChange={(e) => field("purchasePrice", e.target.value)}/></Field>
    <Field label="Data de compra"><input type="date" value={form.purchasedAt} onChange={(e) => field("purchasedAt", e.target.value)}/></Field>
    <Field label="Localização"><input maxLength={180} value={form.location} onChange={(e) => field("location", e.target.value)} placeholder="Ex.: Estante do quarto, prateleira 2"/></Field>
    {form.status === "loaned" && <><Field label="Emprestado para *"><input required maxLength={160} value={form.borrower} onChange={(e) => field("borrower", e.target.value)}/></Field><Field label="Devolução prevista"><input type="date" value={form.loanDueAt} onChange={(e) => field("loanDueAt", e.target.value)}/></Field><div className="gw-wide gw-inline-note"><Check size={16}/> Para registrar a devolução, altere a situação para “Na coleção”.</div></>}
    <Field label="Link HTTPS da capa / foto" wide><input type="url" maxLength={2000} pattern="https://.*" value={form.imageUrl} onChange={(e) => field("imageUrl", e.target.value)} placeholder="https://…"/></Field>
    <Field label="Observações" wide><textarea rows={3} maxLength={4000} value={form.notes} onChange={(e) => field("notes", e.target.value)}/></Field>
    </div>{error && <p className="form-error" role="alert">{error}</p>}<div className="gw-form-actions"><button className="secondary" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar item"}</button></div></form></WorkspaceDialog>;
}
