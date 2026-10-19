/* eslint-disable @next/next/no-img-element -- Capas fornecidas pelo usuário e arte local decorativa. */
"use client";

import { useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUpRight, BookOpen, Bot, Box, CalendarClock, Check, ChevronRight, Gamepad2, Grid2X2, Heart, Layers, LibraryBig, List, Package, Pencil, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles, Star, Trash2, Wallet, X } from "lucide-react";
import { collectionCategories, collectionStatuses, isOverdue, type CollectionInput } from "@/lib/geek-workspace";
import { brl, displayDate, type Listing, useWorkspaceList, WorkspacePagination } from "./shared";
import { CollectionEditor } from "./collection-editor";

type Item = CollectionInput & { id: string; version: number };
type Album = { category: CollectionInput["category"]; entries: number; total: number; owned: number };
type Summary = { owned: number; wishlist: number; loaned: number; invested: string; albums: Album[] };
const themes = {
  manga: { title: "Mangás", subtitle: "HISTÓRIAS SEM FIM", color: "#b286ff", art: "56%", icon: BookOpen },
  comic: { title: "HQs", subtitle: "UNIVERSOS EM QUADRINHOS", color: "#e58aab", art: "100%", icon: LibraryBig },
  figure: { title: "Figures", subtitle: "HERÓIS NA ESTANTE", color: "#76b7ff", art: "72%", icon: Bot },
  game: { title: "Jogos", subtitle: "A PRÓXIMA AVENTURA", color: "#e8c276", art: "88%", icon: Gamepad2 },
  card: { title: "Cartas", subtitle: "PEQUENAS GRANDES HISTÓRIAS", color: "#ef8bd2", art: "100%", icon: Layers },
  other: { title: "Universo geek", subtitle: "TUDO O QUE TE MOVE", color: "#8ed6ce", art: "72%", icon: Sparkles },
};
export function CollectionsWorkspace({ initial, canManage }: { initial: Listing<Item, Summary>; canManage: boolean }) {
  const list = useWorkspaceList("/api/collections", initial);
  const [editor, setEditor] = useState<{ item?: Item } | null>(null);
  const [view, setView] = useState<"collection" | "table">("collection");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const shelf = useRef<HTMLElement>(null);
  const summary = list.data.summary;
  const albums = summary.albums ?? [];
  const activeFilters = [list.q, list.category, list.status, list.minPrice, list.maxPrice].filter(Boolean).length;
  function explore() { shelf.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }
  function create() { setEditor({}); }
  return <div className="page-content gw-workspace cg-page">
    <header className="cg-hero">
      <img className="cg-hero-image" src="/collections/collector-binder-hero.webp" alt="" fetchPriority="high"/>
      <div className="cg-hero-copy"><span className="cg-eyebrow"><LibraryBig size={13}/> SUA COLEÇÃO, SUA HISTÓRIA</span><h1>Colecione<br/><span>o que te move.</span></h1><p>Histórias, personagens e universos que fazem parte de você. Seu acervo merece um lugar à altura.</p><button className="cg-hero-link" onClick={explore}>Explore sua coleção <ArrowDown size={14}/></button></div>
      <div className="cg-hero-signature" aria-hidden="true"><Sparkles size={17}/><span>Mais que itens.<br/><em>Capítulos da sua história.</em></span></div>
      <span className="cg-hero-corner" aria-hidden="true"/>
    </header>

    <section className="cg-stats" aria-label="Resumo geral da coleção">
      <CollectionStat icon={BookOpen} tone="violet" label="Itens no acervo" value={summary.owned} hint="Unidades próprias e emprestadas"/>
      <CollectionStat icon={Layers} tone="blue" label="Categorias na coleção" value={albums.length} hint="Seus universos em um só lugar"/>
      <CollectionStat icon={Wallet} tone="gold" label="Valor de aquisição" value={brl(summary.invested)} hint="Custo informado dos itens próprios"/>
      <CollectionStat icon={Star} tone="rose" label="Lista de desejos" value={summary.wishlist} hint="Próximos capítulos da coleção"/>
    </section>

    <div className="cg-controls"><div className="cg-view-switch" role="group" aria-label="Visualização da coleção"><button aria-pressed={view === "collection"} onClick={() => setView("collection")}><Grid2X2 size={16}/><span>Visualização em coleção</span></button><button aria-pressed={view === "table"} onClick={() => setView("table")}><List size={16}/><span>Visualização em tabela</span></button></div><button className="secondary cg-filter-toggle" aria-expanded={filtersOpen} aria-controls="collection-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16}/>Filtros{activeFilters > 0 && <b>{activeFilters}</b>}</button>{canManage && <button className="primary cg-add" onClick={create}><Plus size={17}/>Adicionar à coleção</button>}</div>
    {list.error && <p className="form-error" role="alert">{list.error}</p>}{list.feedback && <p className="feedback" role="status">{list.feedback}</p>}

    <div className={`cg-layout${filtersOpen ? " cg-filters-open" : ""}`}>
      <aside id="collection-filters" className="cg-filters" aria-label="Filtrar coleção"><div className="cg-filter-heading"><h2><SlidersHorizontal size={16}/>Filtros</h2><button onClick={list.resetFilters} disabled={!activeFilters}>Limpar</button></div>
        <label className="cg-search"><Search size={15}/><input aria-label="Buscar na coleção" placeholder="Título, série ou volume…" value={list.q} onChange={(e) => list.setQ(e.target.value)}/></label>
        <label className="cg-filter-field"><span>Categoria</span><select aria-label="Categoria" value={list.category} onChange={(e) => list.setCategory(e.target.value)}><option value="">Todas as categorias</option>{Object.entries(collectionCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="cg-filter-field"><span>Situação</span><select aria-label="Situação" value={list.status} onChange={(e) => list.setStatus(e.target.value)}><option value="">Todas as situações</option>{Object.entries(collectionStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <fieldset className="cg-price-filter"><legend>Custo por unidade (R$)</legend><div><input aria-label="Custo mínimo" type="number" min="0" max="99999999.99" step="0.01" placeholder="Mínimo" value={list.minPrice} onChange={(e) => list.setMinPrice(e.target.value)}/><span>—</span><input aria-label="Custo máximo" type="number" min="0" max="99999999.99" step="0.01" placeholder="Máximo" value={list.maxPrice} onChange={(e) => list.setMaxPrice(e.target.value)}/></div></fieldset>
        <button className={`cg-loan-filter${list.status === "loaned" ? " active" : ""}`} onClick={() => list.setStatus(list.status === "loaned" ? "" : "loaned")}><CalendarClock size={17}/><span>Empréstimos<small>Acompanhe as devoluções</small></span><b>{summary.loaned}</b></button>
        <div className="cg-filter-note"><ShieldCheck size={20}/><strong>Seu acervo, seu espaço.</strong><p>Organize os detalhes e encontre cada item quando precisar.</p></div>
        <button className="secondary cg-refresh" onClick={list.reload} disabled={list.loading}><RefreshCw size={14} className={list.loading ? "cg-spinning" : ""}/>Atualizar coleção</button>
      </aside>

      <div className="cg-main">
        <section className="cg-albums-panel" ref={shelf}><div className="cg-section-heading"><h2><Box size={16}/>Meus universos</h2><button onClick={() => list.setCategory("")} disabled={!list.category}>Ver todos <ArrowUpRight size={13}/></button></div><div className="cg-album-shelf">
          {Object.entries(themes).map(([key, theme]) => {
            const album = albums.find((row) => row.category === key);
            const Icon = theme.icon;
            const progress = album?.total ? Math.round(album.owned / album.total * 100) : 0;
            return <button key={key} className={`cg-album${list.category === key ? " selected" : ""}`} style={{ "--album-color": theme.color, "--album-position": theme.art } as CSSProperties} aria-pressed={list.category === key} aria-label={`Filtrar ${theme.title}`} onClick={() => list.setCategory(list.category === key ? "" : key)}>
              <span className="cg-album-art" aria-hidden="true"/><span className="cg-album-rings" aria-hidden="true"><i/><i/><i/></span><span className="cg-album-title"><Icon size={17}/><strong>{theme.title}</strong><small>{theme.subtitle}</small></span><span className="cg-album-bottom"><b>{album?.entries ?? 0} {album?.entries === 1 ? "item" : "itens"}</b><span className="cg-album-meter"><i style={{ width: `${progress}%` }}/></span><small>{album ? `${album.owned} de ${album.total} un. no acervo` : "Seu universo começa aqui"}</small></span>{list.category === key && <span className="cg-album-check"><Check size={12}/></span>}
            </button>;
          })}
        </div><p className="cg-shelf-caption"><Sparkles size={12}/> Cada universo reúne uma categoria. A barra mostra as unidades próprias entre todas as cadastradas.</p></section>

        <section className="cg-items-panel" aria-label="Itens da coleção" aria-busy={list.loading}>
          <div className="cg-section-heading cg-items-heading"><div><h2>{list.category ? themes[list.category as keyof typeof themes]?.title ?? "Sua estante geek" : "Sua estante geek"}</h2><span>{list.loading ? "Atualizando…" : `${list.data.total} cadastro${list.data.total === 1 ? "" : "s"} encontrado${list.data.total === 1 ? "" : "s"}`}</span></div><span className="cg-live-mark"><i/>{activeFilters ? "Filtros aplicados" : "Todos os seus universos"}</span></div>
          {activeFilters > 0 && <div className="cg-active-filters">{list.category && <button onClick={() => list.setCategory("")}>{themes[list.category as keyof typeof themes]?.title}<X size={11}/></button>}{list.status && <button onClick={() => list.setStatus("")}>{collectionStatuses[list.status as keyof typeof collectionStatuses]}<X size={11}/></button>}{(list.q || list.minPrice || list.maxPrice) && <button onClick={list.resetFilters}>Limpar filtros <X size={11}/></button>}</div>}
          {view === "collection" ? <div className="gw-collection-grid cg-item-grid">{list.data.items.map((item) => <CollectionCard key={item.id} item={item} canManage={canManage} onEdit={() => setEditor({ item })} onRemove={() => void list.remove(item)}/>)}</div> : <div className="cg-table-wrap"><table><thead><tr><th>Item</th><th>Situação</th><th>Unidades</th><th>Custo / un.</th><th>Ações</th></tr></thead><tbody>{list.data.items.map((item) => <tr key={item.id}><td><div className="cg-table-item"><span style={{ color: themes[item.category].color }}><BookOpen size={18}/></span><div><strong>{item.title}</strong><small>{item.series || collectionCategories[item.category]}{item.edition && ` · ${item.edition}`}</small></div></div></td><td><span className={`gw-badge gw-status-${item.status}`}>{collectionStatuses[item.status]}</span>{item.status === "loaned" && <small className="cg-table-loan">Com {item.borrower} · {displayDate(item.loanDueAt)}</small>}</td><td>{item.quantity}</td><td>{brl(item.purchasePrice)}</td><td>{canManage && <div className="cg-table-actions"><button className="secondary" aria-label={`Editar ${item.title}`} onClick={() => setEditor({ item })}><Pencil size={14}/></button><button className="secondary danger" aria-label={`Excluir ${item.title}`} onClick={() => void list.remove(item)}><Trash2 size={14}/></button></div>}</td></tr>)}</tbody></table></div>}
          {!list.data.items.length && !list.loading && <div className="cg-empty"><div className="cg-empty-icon"><LibraryBig size={36}/><Sparkles size={17}/></div><span className="cg-eyebrow">HÁ UM UNIVERSO PARA DESCOBRIR</span><h3>{activeFilters ? "Nenhum item por aqui… ainda." : "O primeiro capítulo é seu."}</h3><p>{activeFilters ? "Experimente outra categoria ou limpe os filtros para reencontrar seus itens." : "Adicione sua primeira peça, aquele mangá favorito ou a próxima aventura da sua lista de desejos."}</p>{activeFilters ? <button className="secondary" onClick={list.resetFilters}>Limpar filtros</button> : canManage && <button className="primary" onClick={create}><Plus size={15}/>Adicionar primeiro item</button>}</div>}
          <WorkspacePagination total={list.data.total} page={list.page} pageSize={list.data.pageSize} loading={list.loading} onPage={list.setPage}/>
        </section>
        <p className="cg-footer-note"><Heart size={12}/> Feito para quem vê uma história em cada item. <span>Valores de aquisição informados por você.</span></p>
      </div>
    </div>
    {editor && <CollectionEditor item={editor.item} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); list.setFeedback("Coleção atualizada."); list.reload(); }}/>} 
  </div>;
}
function CollectionStat({ icon: Icon, tone, label, value, hint }: { icon: typeof BookOpen; tone: string; label: string; value: React.ReactNode; hint: string }) {
  return <article className={`cg-stat cg-stat-${tone}`}><span className="cg-stat-icon"><Icon size={24}/></span><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div><span className="cg-stat-etching" aria-hidden="true"/></article>;
}
function CollectionCard({ item, canManage, onEdit, onRemove }: { item: Item; canManage: boolean; onEdit: () => void; onRemove: () => void }) {
  const [brokenImage, setBrokenImage] = useState(false);
  const theme = themes[item.category];
  const Icon = theme.icon;
  const overdue = isOverdue(item.loanDueAt, item.status !== "loaned");
  return <article className={`gw-collectible cg-collectible gw-category-${item.category}`} style={{ "--album-color": theme.color, "--album-position": theme.art } as CSSProperties}>
    <div className="gw-cover cg-cover">{item.imageUrl && !brokenImage ? <img src={item.imageUrl} alt={`Capa de ${item.title}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setBrokenImage(true)}/> : <div className="cg-item-placeholder"><span className="cg-item-fantasy"/><Icon size={36}/><small>{theme.title}</small><strong>{item.series || item.title}</strong><span className="cg-item-edition">{item.edition || "SUA COLEÇÃO"}</span></div>}<span className={`gw-badge gw-status-${item.status}`}>{collectionStatuses[item.status]}</span><span className="gw-copy-count">{item.quantity} un.</span></div>
    <div className="gw-collectible-copy"><small>{collectionCategories[item.category]}{item.edition ? ` · ${item.edition}` : ""}</small><h3>{item.title}</h3><p>{item.series || "Coleção independente"}</p>{item.status === "loaned" ? <div className={overdue ? "gw-loan gw-overdue" : "gw-loan"}><CalendarClock size={15}/><span>Com {item.borrower}<small>{overdue ? "Devolução atrasada · " : "Devolução: "}{displayDate(item.loanDueAt)}</small></span></div> : <div className="gw-item-cost"><span>{item.status === "wishlist" ? "Planejado / un." : "Aquisição / un."}</span><strong>{brl(item.purchasePrice)}</strong></div>}{item.location && <p className="gw-location"><Package size={13}/>{item.location}</p>}{item.notes && <p className="gw-item-notes">{item.notes}</p>}{canManage && <div className="gw-card-actions"><button className="secondary" onClick={onEdit}><Pencil size={14}/>{item.status === "loaned" ? "Editar / devolver" : "Editar"}<ChevronRight size={13}/></button><button className="secondary danger" aria-label={`Excluir ${item.title}`} onClick={onRemove}><Trash2 size={14}/></button></div>}</div>
  </article>;
}
