/* eslint-disable @next/next/no-img-element -- Arte decorativa local do ateliê. */
"use client";

import { useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUpRight, BadgeCheck, Bot, CalendarClock, Check, ChevronRight, CircleCheck, ClipboardCopy, ClipboardList, Grid2X2, Hammer, List, PackageCheck, Pencil, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles, Spool, Trash2, UserRound, Wallet, WandSparkles, X } from "lucide-react";
import { commissionCategories, commissionStatuses, estimateCommission, isOverdue, type CommissionInput } from "@/lib/geek-workspace";
import { brl, displayDate, type Listing, useWorkspaceList, WorkspacePagination } from "./shared";
import { CommissionEditor } from "./commission-editor";

type Item = CommissionInput & { id: string; version: number; estimate: ReturnType<typeof estimateCommission> };
type Stage = CommissionInput["status"];
type Summary = { open: number; production: number; overdue: number; receivable: string; stages: { status: Stage; total: number }[] };
const stages = {
  quote: { color: "#b896e8", icon: ClipboardList, short: "Orçamento", caption: "Planejar a ideia" },
  approved: { color: "#8ba9ec", icon: BadgeCheck, short: "Aprovadas", caption: "Tudo combinado" },
  production: { color: "#e8bd79", icon: Hammer, short: "Em produção", caption: "Mãos à obra" },
  ready: { color: "#89d9cf", icon: PackageCheck, short: "Prontas", caption: "Últimos detalhes" },
  delivered: { color: "#93cfae", icon: CircleCheck, short: "Entregues", caption: "Histórias realizadas" },
  canceled: { color: "#c39aac", icon: X, short: "Canceladas", caption: "Projetos arquivados" },
};
const categories = {
  cosplay: { icon: ShieldCheck, color: "#e3bc7c", position: "91%", label: "COSPLAY & PERSONAGENS" },
  craft: { icon: Spool, color: "#c5a5ec", position: "59%", label: "CRIAÇÕES ARTESANAIS" },
  print3d: { icon: Bot, color: "#86cfe2", position: "65%", label: "IMPRESSÃO & MODELAGEM 3D" },
  other: { icon: WandSparkles, color: "#9ed6bd", position: "79%", label: "PROJETOS AUTORAIS" },
};
const productionSteps: Stage[] = ["quote", "approved", "production", "ready", "delivered"];
export function CommissionsWorkspace({ initial, canManage }: { initial: Listing<Item, Summary>; canManage: boolean }) {
  const list = useWorkspaceList("/api/commissions", initial);
  const [editor, setEditor] = useState<{ item?: Item } | null>(null);
  const [view, setView] = useState<"projects" | "table">("projects");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [copyError, setCopyError] = useState("");
  const bench = useRef<HTMLElement>(null);
  const summary = list.data.summary;
  const activeFilters = [list.q, list.category, list.status].filter(Boolean).length;
  function create() { setEditor({}); }
  async function copyQuote(item: Item) {
    try {
      await navigator.clipboard.writeText(`Orçamento — ${item.title}\nCliente: ${item.customer}\nQuantidade: ${item.quantity}\nValor total: ${brl(item.totalPrice)}\nRecebido: ${brl(item.paidAmount)}\nSaldo: ${brl(item.estimate.remaining)}\nEntrega prevista: ${displayDate(item.dueAt)}`);
      setCopyError(""); list.setFeedback("Resumo copiado. Envie ao cliente pelo seu canal preferido.");
    } catch { setCopyError("Não foi possível copiar. Verifique a permissão da área de transferência do navegador."); }
  }
  return <div className="page-content gw-workspace cw-page">
    <header className="cg-hero cw-hero"><img className="cg-hero-image" src="/commissions/maker-studio-hero.webp" alt="" fetchPriority="high"/><div className="cg-hero-copy"><span className="cg-eyebrow"><WandSparkles size={13}/> SEU TALENTO, SEU ATELIÊ</span><h1>Ideias ganham forma.<br/><span>Seu negócio também.</span></h1><p>Do primeiro esboço à entrega especial. Crie com liberdade e dê a cada projeto o cuidado que ele merece.</p><button className="cg-hero-link" onClick={() => bench.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })}>Explore sua bancada <ArrowDown size={14}/></button></div><div className="cg-hero-signature" aria-hidden="true"><Sparkles size={17}/><span>Feito à mão.<br/><em>Gerido com cuidado.</em></span></div><span className="cg-hero-corner" aria-hidden="true"/></header>
    <section className="cg-stats cw-stats" aria-label="Resumo geral das encomendas"><StudioStat icon={ClipboardList} tone="violet" label="Em andamento" value={summary.open} hint="Orçamentos e pedidos em aberto"/><StudioStat icon={Hammer} tone="blue" label="Na bancada" value={summary.production} hint="Projetos em produção"/><StudioStat icon={CalendarClock} tone="rose" label="Prazos vencidos" value={summary.overdue} hint="Pendências que pedem atenção"/><StudioStat icon={Wallet} tone="gold" label="A receber" value={brl(summary.receivable)} hint="Saldo dos pedidos confirmados"/></section>
    <div className="cg-controls cw-controls"><div className="cg-view-switch" role="group" aria-label="Visualização das encomendas"><button aria-pressed={view === "projects"} onClick={() => setView("projects")}><Grid2X2 size={16}/><span>Visualização em projetos</span></button><button aria-pressed={view === "table"} onClick={() => setView("table")}><List size={16}/><span>Visualização em tabela</span></button></div><button className="secondary cg-filter-toggle" aria-expanded={filtersOpen} aria-controls="commission-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16}/>Filtros{activeFilters > 0 && <b>{activeFilters}</b>}</button>{canManage && <button className="primary cw-new" onClick={create}><Plus size={17}/>Nova encomenda</button>}</div>
    {list.error && <p className="form-error" role="alert">{list.error}</p>}{copyError && <p className="form-error" role="alert">{copyError}</p>}{list.feedback && <p className="feedback" role="status">{list.feedback}</p>}
    <div className={`cg-layout cw-layout${filtersOpen ? " cg-filters-open" : ""}`}>
      <aside id="commission-filters" className="cg-filters cw-filters" aria-label="Filtrar encomendas"><div className="cg-filter-heading"><h2><SlidersHorizontal size={16}/>Filtros</h2><button onClick={list.resetFilters} disabled={!activeFilters}>Limpar</button></div><label className="cg-search"><Search size={15}/><input aria-label="Buscar encomendas" placeholder="Projeto ou cliente…" value={list.q} onChange={(e) => list.setQ(e.target.value)}/></label><label className="cg-filter-field"><span>Tipo de projeto</span><select aria-label="Tipo de encomenda" value={list.category} onChange={(e) => list.setCategory(e.target.value)}><option value="">Todos os tipos</option>{Object.entries(commissionCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="cg-filter-field"><span>Etapa de criação</span><select aria-label="Etapa" value={list.status} onChange={(e) => list.setStatus(e.target.value)}><option value="">Todas as etapas</option>{Object.entries(commissionStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <div className={`cw-priority-note${summary.overdue > 0 ? " attention" : ""}`}><CalendarClock size={20}/><strong>{summary.overdue > 0 ? `${summary.overdue} prazo${summary.overdue > 1 ? "s" : ""} para revisar` : "Cada prazo importa."}</strong><p>{summary.overdue > 0 ? "Confira as datas de entrega nos projetos sinalizados." : "Defina a entrega prevista e acompanhe os próximos passos."}</p></div>
        <div className="cg-filter-note"><Sparkles size={20}/><strong>Mais tempo para criar.</strong><p>Materiais, horas e valores organizados para você cuidar do que faz melhor.</p></div><button className="secondary cg-refresh" onClick={list.reload} disabled={list.loading}><RefreshCw size={14} className={list.loading ? "cg-spinning" : ""}/>Atualizar projetos</button></aside>
      <div className="cg-main cw-main">
        <section className="cw-pipeline" aria-label="Etapas das encomendas" ref={bench}><div className="cg-section-heading"><h2><LayersIcon/>Da ideia à entrega</h2><button disabled={!list.status} onClick={() => list.setStatus("")}>Ver todas <ArrowUpRight size={13}/></button></div><div className="cw-stage-grid">{Object.entries(stages).map(([key, stage], index) => {
          const Icon = stage.icon;
          const total = summary.stages?.find((entry) => entry.status === key)?.total ?? 0;
          return <button className={`cw-stage${list.status === key ? " active" : ""}`} key={key} style={{ "--stage-color": stage.color } as CSSProperties} aria-label={`Filtrar etapa ${commissionStatuses[key as Stage]}`} aria-pressed={list.status === key} onClick={() => list.setStatus(list.status === key ? "" : key)}><span className="cw-stage-icon"><Icon size={18}/></span><strong>{total}</strong><b>{stage.short}</b><small>{stage.caption}</small><span className="cw-stage-number" aria-hidden="true">{index < 5 ? `0${index + 1}` : "—"}</span>{list.status === key && <Check className="cw-stage-check" size={12}/>}</button>;
        })}</div><p className="cw-pipeline-caption">Selecione uma etapa para filtrar. Os indicadores acima resumem todos os seus projetos.</p></section>
        <section className="cw-projects" aria-label="Encomendas" aria-busy={list.loading}><div className="cg-section-heading cg-items-heading"><div><h2>{list.status ? commissionStatuses[list.status as Stage] : "Projetos na sua bancada"}</h2><span>{list.loading ? "Atualizando…" : `${list.data.total} encomenda${list.data.total === 1 ? "" : "s"} encontrada${list.data.total === 1 ? "" : "s"}`}</span></div><span className="cw-live-mark"><i/>{activeFilters ? "Filtros aplicados" : "Seu estúdio, organizado"}</span></div>
          {activeFilters > 0 && <div className="cg-active-filters cw-active-filters">{list.category && <button onClick={() => list.setCategory("")}>{commissionCategories[list.category as CommissionInput["category"]]}<X size={11}/></button>}{list.status && <button onClick={() => list.setStatus("")}>{commissionStatuses[list.status as Stage]}<X size={11}/></button>}{list.q && <button onClick={() => list.setQ("")}>Busca: {list.q}<X size={11}/></button>}</div>}
          {view === "projects" ? <div className="gw-commission-grid cw-project-grid">{list.data.items.map((item) => <ProjectCard key={item.id} item={item} canManage={canManage} onEdit={() => setEditor({ item })} onCopy={() => void copyQuote(item)} onRemove={() => void list.remove(item)}/>)}</div> : <div className="cg-table-wrap cw-table"><table><thead><tr><th>Projeto / cliente</th><th>Etapa / entrega</th><th>Combinado</th><th>A receber</th><th>Ações</th></tr></thead><tbody>{list.data.items.map((item) => {
            const overdue = isOverdue(item.dueAt, item.status === "delivered" || item.status === "canceled");
            const Icon = categories[item.category].icon;
            return <tr key={item.id}><td><div className="cg-table-item"><span style={{ color: categories[item.category].color }}><Icon size={18}/></span><div><strong>{item.title}</strong><small>{item.customer} · {commissionCategories[item.category]}</small></div></div></td><td><span className={`gw-badge gw-status-${item.status}`}>{commissionStatuses[item.status]}</span><small className={`cg-table-loan${overdue ? " gw-overdue" : ""}`}>{overdue ? "Atrasada · " : "Entrega: "}{displayDate(item.dueAt)}</small></td><td>{brl(item.totalPrice)}</td><td>{brl(item.estimate.remaining)}</td><td><div className="cg-table-actions">{canManage && <button className="secondary" aria-label={`Gerenciar ${item.title}`} onClick={() => setEditor({ item })}><Pencil size={14}/></button>}<button className="secondary" aria-label={`Copiar orçamento de ${item.title}`} onClick={() => void copyQuote(item)}><ClipboardCopy size={14}/></button>{canManage && <button className="secondary danger" aria-label={`Excluir ${item.title}`} onClick={() => void list.remove(item)}><Trash2 size={14}/></button>}</div></td></tr>;
          })}</tbody></table></div>}
          {!list.data.items.length && !list.loading && <div className="cw-empty"><span className="cw-empty-orbit"><Hammer size={34}/><Sparkles size={15}/></span><span className="cg-eyebrow">TODA GRANDE CRIAÇÃO COMEÇA COM UMA IDEIA</span><h3>{activeFilters ? "Nenhum projeto com esses filtros." : "Sua próxima criação começa aqui."}</h3><p>{activeFilters ? "Experimente outra etapa ou limpe os filtros para encontrar suas encomendas." : "Uma armadura, uma peça 3D, algo que só você sabe fazer. Organize o primeiro orçamento e dê forma ao projeto."}</p>{activeFilters ? <button className="secondary" onClick={list.resetFilters}>Limpar filtros</button> : canManage && <button className="primary" onClick={create}><Plus size={15}/>Criar orçamento</button>}<div className="cw-empty-steps" aria-hidden="true"><span><ClipboardList size={14}/>Planejar</span><ChevronRight size={12}/><span><Hammer size={14}/>Criar</span><ChevronRight size={12}/><span><PackageCheck size={14}/>Entregar</span></div></div>}
          <WorkspacePagination total={list.data.total} page={list.page} pageSize={list.data.pageSize} loading={list.loading} onPage={list.setPage}/>
        </section><p className="cw-footer-note"><Sparkles size={12}/>Seu talento merece uma operação à altura.<span>Custos e recebimentos informados por você.</span></p>
      </div>
    </div>
    {editor && <CommissionEditor item={editor.item} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); list.setFeedback("Encomenda salva."); list.reload(); }}/>} 
  </div>;
}
function LayersIcon() { return <ClipboardList size={16}/>; }
function StudioStat({ icon: Icon, tone, label, value, hint }: { icon: typeof Hammer; tone: string; label: string; value: React.ReactNode; hint: string }) {
  return <article className={`cg-stat cg-stat-${tone}`}><span className="cg-stat-icon"><Icon size={24}/></span><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div><span className="cg-stat-etching" aria-hidden="true"/></article>;
}
function ProjectCard({ item, canManage, onEdit, onCopy, onRemove }: { item: Item; canManage: boolean; onEdit: () => void; onCopy: () => void; onRemove: () => void }) {
  const category = categories[item.category];
  const Icon = category.icon;
  const step = productionSteps.indexOf(item.status);
  const overdue = isOverdue(item.dueAt, item.status === "delivered" || item.status === "canceled");
  const paidProgress = Number(item.totalPrice) > 0 ? Math.round(Number(item.paidAmount) / Number(item.totalPrice) * 100) : 0;
  return <article className={`gw-order cw-project-card${overdue ? " gw-order-overdue" : ""}`} style={{ "--project-color": category.color, "--project-position": category.position } as CSSProperties}>
    <div className="cw-project-cover" aria-hidden="true"><span className="cw-project-cover-art"/><span className="cw-project-cover-emblem"><Icon size={29}/></span><span className="cw-project-cover-label">{category.label}</span><span className="cw-cover-corner"/></div>
    <div className="cw-project-content"><div className="cw-project-meta"><span className={`gw-badge gw-status-${item.status}`}>{commissionStatuses[item.status]}</span><small>{item.quantity} {item.quantity === 1 ? "peça" : "peças"}</small></div><h3>{item.title}</h3><p className="gw-customer"><UserRound size={13}/>{item.customer}</p>{item.contact && <p className="gw-contact">{item.contact}</p>}<p className={`gw-deadline${overdue ? " gw-overdue" : ""}`}><CalendarClock size={14}/>{overdue ? "Atrasada · " : "Entrega: "}{displayDate(item.dueAt)}</p>
      {step >= 0 && <div className="cw-step-track" aria-label={`Etapa ${step + 1} de 5: ${commissionStatuses[item.status]}`}>{productionSteps.map((status, index) => <i key={status} className={index <= step ? "done" : ""}/>)}<span>{step + 1}/5 · {commissionStatuses[item.status]}</span></div>}
      <div className="gw-order-amounts cw-project-amounts"><div><span>Valor combinado</span><strong>{brl(item.totalPrice)}</strong></div><div><span>Saldo a receber</span><strong>{brl(item.estimate.remaining)}</strong></div><div><span>Custo estimado</span><b>{brl(item.estimate.totalCost)}</b></div><div><span>Resultado estimado</span><b className={Number(item.estimate.estimatedProfit) < 0 ? "gw-overdue" : "gw-positive"}>{brl(item.estimate.estimatedProfit)}</b></div></div>
      <div className="cw-payment"><div><span><Wallet size={12}/>Recebido</span><b>{brl(item.paidAmount)}</b></div><div className="cw-payment-track" role="progressbar" aria-label="Valor recebido" aria-valuemin={0} aria-valuemax={Math.max(Number(item.totalPrice), 1)} aria-valuenow={Number(item.paidAmount)}><i style={{ width: `${paidProgress}%` }}/></div></div>
      {item.status === "canceled" && <p className="gw-item-notes">Cancelada · fora do total a receber. Valores registrados permanecem no histórico.</p>}{item.notes && <p className="gw-item-notes">{item.notes}</p>}
      <div className="gw-card-actions">{canManage && <button className="secondary" onClick={onEdit}><Pencil size={14}/>Gerenciar<ChevronRight size={13}/></button>}<button className="secondary" aria-label={`Copiar orçamento de ${item.title}`} onClick={onCopy}><ClipboardCopy size={14}/></button>{canManage && <button className="secondary danger" aria-label={`Excluir ${item.title}`} onClick={onRemove}><Trash2 size={14}/></button>}</div>
    </div>
  </article>;
}
