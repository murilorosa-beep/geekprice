"use client";

import { cloneElement, type ReactElement, useCallback, useEffect, useId, useRef, useState } from "react";
import { BookOpen, Box, Gem, Hammer, Layers, X } from "lucide-react";

export const brl = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
export const displayDate = (value: string) => value ? value.split("-").reverse().join("/") : "Sem prazo";
export type Listing<T, S> = { items: T[]; total: number; page: number; pageSize: number; summary: S };
export function useWorkspaceList<T, S>(endpoint: string, initial: Listing<T, S>) {
  const [data, setData] = useState(initial);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ q, category, status, page: String(page) });
        if (minPrice !== "") params.set("minPrice", minPrice);
        if (maxPrice !== "") params.set("maxPrice", maxPrice);
        const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar os cadastros.");
        setData(body);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha de conexão.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [endpoint, q, category, status, page, minPrice, maxPrice, refresh]);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  function filter(setter: (value: string) => void, value: string) { setter(value); setPage(1); }
  async function remove(item: { id: string; version: number; title: string }) {
    if (!window.confirm(`Excluir “${item.title}”? Esta ação não pode ser desfeita.`)) return;
    try {
      const response = await fetch(`${endpoint}/${item.id}?version=${item.version}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error || "Não foi possível excluir.");
      setFeedback("Cadastro excluído."); setPage(1); reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha de conexão."); }
  }
  function resetFilters() { setQ(""); setCategory(""); setStatus(""); setMinPrice(""); setMaxPrice(""); setPage(1); }
  return { data, q, category, status, minPrice, maxPrice, page, loading, error, feedback, setFeedback, setPage, reload, remove, resetFilters,
    setMinPrice: (value: string) => filter(setMinPrice, value), setMaxPrice: (value: string) => filter(setMaxPrice, value),
    setQ: (value: string) => filter(setQ, value), setCategory: (value: string) => filter(setCategory, value), setStatus: (value: string) => filter(setStatus, value) };
}
export async function saveWorkspace(endpoint: string, value: unknown, item?: { id: string; version: number }) {
  const response = await fetch(item ? `${endpoint}/${item.id}` : endpoint, {
    method: item ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(value as object), ...(item ? { version: item.version } : {}) }),
  });
  if (!response.ok) {
    const body = await response.json();
    const detail = body.details ? Object.values(body.details).flat().join(" ") : "";
    throw new Error(`${body.error || "Não foi possível salvar."}${detail ? ` ${detail}` : ""}`);
  }
}
export function WorkspaceHero({ kind, title, description, action }: { kind: "collection" | "commission"; title: string; description: string; action: React.ReactNode }) {
  const Icon = kind === "collection" ? Layers : Hammer;
  return <header className={`gw-hero gw-hero-${kind}`}><div className="gw-hero-copy"><span className="gw-kicker"><Icon size={14}/> {kind === "collection" ? "SEU UNIVERSO, ORGANIZADO" : "DO RASCUNHO À ENTREGA"}</span><h1>{title}</h1><p>{description}</p>{action}</div><div className="gw-hero-art" aria-hidden="true">{kind === "collection" ? <><div className="gw-spine"><BookOpen/><span>MANGÁ</span></div><div className="gw-spine"><Gem/><span>COLEÇÃO</span></div><div className="gw-spine"><Box/><span>UNIVERSO</span></div></> : <div className="gw-blueprint"><Hammer size={58}/><i/><span>IDEIA → CRIAÇÃO → ENTREGA</span></div>}</div></header>;
}
export function WorkspaceStats({ items }: { items: { label: string; value: React.ReactNode; hint: string }[] }) {
  return <section className="gw-stats" aria-label="Resumo geral">{items.map((item) => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.hint}</small></article>)}</section>;
}
export function WorkspaceDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog className="gw-dialog" ref={ref} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); onClose(); }}><header><div><span className="gw-kicker">GEEK WORKSPACE</span><h2 id={id}>{title}</h2></div><button type="button" className="secondary" aria-label="Fechar" onClick={onClose}><X size={18}/></button></header>{children}</dialog>;
}
export function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  const id = useId();
  return <label className={`gw-field${wide ? " gw-wide" : ""}`}><span id={id}>{label}</span>{cloneElement(children as ReactElement<{ "aria-labelledby"?: string }>, { "aria-labelledby": id })}</label>;
}
export function WorkspacePagination({ total, page, pageSize, loading, onPage }: { total: number; page: number; pageSize: number; loading: boolean; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <footer className="gw-pagination"><span>{total} cadastro(s) · página {page} de {pages}</span><div><button className="secondary" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Anterior</button><button className="secondary" disabled={loading || page >= pages} onClick={() => onPage(page + 1)}>Próxima</button></div></footer>;
}
