/* eslint-disable @next/next/no-img-element -- As imagens de cartas vêm dos catálogos externos já associados ao produto. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Pencil, Plus, Trash2, X, LayoutGrid, List, Layers, ArrowUpRight, Sparkles } from "lucide-react";
import { cardConditionLabel, cardFinishLabel, cardLanguageLabel } from "@/lib/card-display";
import { useRouter } from "next/navigation";
import { SmartRegistrationModal } from "@/components/smart-registration-modal";
import { ProductPriceGuidance } from "@/components/product-price-guidance";

type Item = { id: string; name: string; imageUrl: string | null; category: string; set: string | null; code: string | null; sku: string; cost: number; currentPrice: number; stock: number; desiredMarginPercent: number; marketPrice: number | null; language: string; condition: string; finish: string };
type Result = { items: Item[]; total: number; page: number; pageSize: number };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const emptyForm = { name: "", category: "", sku: "", setName: "", collectorNumber: "", language: "pt-BR", condition: "new", finish: "standard", cost: "0", price: "0", quantity: "0", desiredMarginPercent: "25" };

export function ProductManager({ initial }: { initial?: Result }) {
  const router = useRouter();
  const [smartOpen, setSmartOpen] = useState(false);
  const [view, setView] = useState<"table" | "collection">("table");
  const firstLoad = useRef(Boolean(initial));
  const [data, setData] = useState<Result>(initial ?? { items: [], total: 0, page: 1, pageSize: 10 });
  const [query, setQuery] = useState(""); const [category, setCategory] = useState(""); const [availability, setAvailability] = useState("all"); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(!initial); const [error, setError] = useState(""); const [modal, setModal] = useState<"create" | "edit" | "detail" | null>(null); const [selected, setSelected] = useState<Item | null>(null); const [form, setForm] = useState(emptyForm); const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ q: query, category, availability, page: String(page), pageSize: "10" });
    const response = await fetch(`/api/inventory?${params}`);
    if (response.status === 401) { router.push("/login"); return; }
    const body = await response.json(); setLoading(false);
    if (!response.ok) return setError(body.error ?? "Não foi possível carregar os produtos.");
    setData(body);
  }, [query, category, availability, page, router]);
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return; }
    const delay = (query || category) ? 250 : 0;
    const timer = window.setTimeout(load, delay);
    return () => window.clearTimeout(timer);
  }, [load, query, category]);
  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId) return;
    let active = true;
    fetch(`/api/inventory/${encodeURIComponent(editId)}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Produto não encontrado.");
      if (active) {
        const item = body as Item;
        setSelected(item);
        setForm({ ...emptyForm, cost: String(item.cost), price: String(item.currentPrice), quantity: String(item.stock), desiredMarginPercent: String(item.desiredMarginPercent) });
        setModal("edit");
      }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível abrir o produto."); });
    return () => { active = false; };
  }, []);

  function openCreate() { setSelected(null); setForm(emptyForm); setModal("create"); setError(""); }
  function openEdit(item: Item) { setSelected(item); setForm({ ...emptyForm, cost: String(item.cost), price: String(item.currentPrice), quantity: String(item.stock), desiredMarginPercent: String(item.desiredMarginPercent) }); setModal("edit"); setError(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const payload = modal === "edit" ? { cost: form.cost, price: form.price, quantity: form.quantity, desiredMarginPercent: form.desiredMarginPercent } : form;
    const response = await fetch(modal === "edit" ? `/api/inventory/${selected?.id}` : "/api/inventory", { method: modal === "edit" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) return setError(body?.error ?? "Não foi possível salvar.");
    setModal(null); if (modal === "edit" && window.location.search.includes("edit=")) router.replace("/products"); setFeedback(modal === "edit" ? "Produto atualizado." : "Produto cadastrado."); await load();
  }
  async function remove(item: Item) {
    if (!window.confirm(`Excluir ${item.name} do estoque? Esta ação não pode ser desfeita.`)) return;
    const response = await fetch(`/api/inventory/${item.id}`, { method: "DELETE" });
    if (!response.ok) { const body = await response.json(); return setError(body.error ?? "Não foi possível excluir."); }
    setFeedback("Produto excluído do estoque."); await load();
  }
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return <div className="page-content inventory-page"><div className="page-title"><div><p className="eyebrow">ESTOQUE DA ORGANIZAÇÃO</p><h1>Sua coleção</h1><p>Cadastre suas cartas, confira a edição e mantenha preços e quantidades atualizados.</p></div><div className="page-actions"><button className="primary small" onClick={() => setSmartOpen(true)}>Buscar carta no catálogo</button><button className="secondary" onClick={openCreate}><Plus size={17}/>Produto manual</button></div></div>
    <details className="product-onboarding-guide"><summary><Layers size={15}/> Como organizar seu acervo</summary><section className="product-onboarding" aria-label="Como começar"><div><strong>1. Cadastre</strong><span>Busque a carta no catálogo para trazer foto e dados da edição. Use o cadastro manual para outros itens.</span></div><div><strong>2. Confira</strong><span>Abra “Ver detalhes” para revisar coleção, idioma, acabamento, custo e preço.</span></div><div><strong>3. Acompanhe</strong><span>Depois, consulte o Mercado e analise sugestões no Autopilot.</span></div></section></details>
    {feedback && <div className="feedback">{feedback}</div>}{error && <div className="form-error">{error}</div>}
    {smartOpen && <SmartRegistrationModal onClose={() => setSmartOpen(false)} onCreated={async () => { setFeedback("Carta cadastrada e vinculada ao catálogo."); await load(); }}/>} 
    <div className="filters"><input aria-label="Buscar produtos" placeholder="Buscar nome, coleção, código ou categoria" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }}/><input aria-label="Categoria" placeholder="Categoria" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}/><select aria-label="Disponibilidade" value={availability} onChange={(e) => { setAvailability(e.target.value); setPage(1); }}><option value="all">Toda disponibilidade</option><option value="in_stock">Em estoque</option><option value="out_of_stock">Sem estoque</option></select></div>
    <div className="inventory-viewbar"><span><Layers size={16}/><strong>{data.total}</strong> produtos no acervo</span><div className="view-switch" role="group" aria-label="Visualização do estoque"><button type="button" aria-pressed={view === "table"} className={view === "table" ? "active" : ""} onClick={() => setView("table")}><List size={16}/> Tabela</button><button type="button" aria-pressed={view === "collection"} className={view === "collection" ? "active" : ""} onClick={() => setView("collection")}><LayoutGrid size={16}/> Coleção</button></div></div>
    <details className="pricing-guide-details"><summary><Sparkles size={15}/> Inteligência de preços <span>Ver orientações do seu estoque</span></summary><ProductPriceGuidance items={data.items}/></details>
    <section className="panel products-panel">{view === "collection" && data.items.length > 0 ? <div className="inventory-collection">{data.items.map((item) => <button className="stock-collectible" key={item.id} onClick={() => { setSelected(item); setModal("detail"); }}><div className="stock-collectible-art"><CardArtwork item={item} large/><span className="stock-collectible-quantity">{item.stock} un.</span></div><span className="stock-collectible-name">{item.name}</span><small>{item.set || "Sem coleção"} · {item.code || item.sku}</small><span className="collectible-tags"><span>{cardLanguageLabel(item.language)}</span><span>{cardConditionLabel(item.condition)}</span><span>{cardFinishLabel(item.finish)}</span></span><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.currentPrice)}</strong><span className="collectible-open">Ver detalhes <ArrowUpRight size={13}/></span></button>)}</div> : <div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>SKU</th><th>CUSTO</th><th>PREÇO</th><th>ESTOQUE</th><th>MARGEM</th><th>AÇÕES</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td><div className="product-cell"><CardArtwork item={item}/><div><strong>{item.name}</strong><span>{item.set || "Sem coleção"} · {item.category}</span></div></div></td><td>{item.sku}</td><td>{money.format(item.cost)}</td><td>{money.format(item.currentPrice)}</td><td>{item.stock}</td><td>{item.desiredMarginPercent}%</td><td><div className="product-row-actions"><button className="row-action" aria-label={`Ver detalhes de ${item.name}`} onClick={() => { setSelected(item); setModal("detail"); }}><Eye size={16}/> Ver detalhes</button><button className="row-action" aria-label={`Editar ${item.name}`} onClick={() => openEdit(item)}><Pencil size={16}/></button><button className="row-action danger" aria-label={`Excluir ${item.name}`} onClick={() => remove(item)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{!loading && data.items.length === 0 && <div className="empty" style={{ padding: "32px 20px" }}>{!query && !category ? <div><p style={{ margin: "0 0 6px 0", fontSize: "0.95rem", fontWeight: 600 }}>Sua loja ainda não possui produtos cadastrados no estoque.</p><p style={{ margin: "0 0 14px 0", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>Adicione cartas oficiais diretamente pelo Catálogo Inteligente ou cadastre seus produtos avulsos:</p><div style={{ display: "flex", gap: 10, justifyContent: "center" }}><button className="primary small" onClick={() => setSmartOpen(true)}>Cadastro Inteligente de Cartas</button><button className="secondary small" onClick={openCreate}><Plus size={16}/>Novo produto manual</button></div></div> : "Nenhum produto corresponde aos filtros de busca."}</div>}{loading && <div className="empty">Carregando produtos...</div>}</div>}<div className="pagination"><span>{data.total} produto(s) · página {page} de {pages}</span><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><button disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></section>
    {modal && <div className="drawer-layer" onMouseDown={() => setModal(null)}><section className="modal-card" onMouseDown={(e) => e.stopPropagation()}><button className="drawer-close" onClick={() => setModal(null)}><X/></button>{modal === "detail" && selected ? <ProductDetail item={selected}/> : <form onSubmit={save}><p className="eyebrow">{modal === "edit" ? "ATUALIZAR ESTOQUE" : "NOVO ITEM"}</p><h2>{modal === "edit" ? selected?.name : "Cadastrar produto"}</h2>{modal === "edit" && <p className="muted">Dados globais do catálogo permanecem imutáveis; altere os dados privados da sua loja.</p>}<div className="form-grid">{modal === "create" && <><Field label="Nome"><input required minLength={2} value={form.name} onChange={(e) => setForm({...form,name:e.target.value})}/></Field><Field label="Categoria"><input required value={form.category} onChange={(e) => setForm({...form,category:e.target.value})}/></Field><Field label="SKU"><input required value={form.sku} onChange={(e) => setForm({...form,sku:e.target.value})}/></Field><Field label="Coleção / edição"><input value={form.setName} onChange={(e) => setForm({...form,setName:e.target.value})}/></Field><Field label="Código / número"><input value={form.collectorNumber} onChange={(e) => setForm({...form,collectorNumber:e.target.value})}/></Field><Field label="Idioma"><input value={form.language} onChange={(e) => setForm({...form,language:e.target.value})}/></Field><Field label="Condição"><select value={form.condition} onChange={(e) => setForm({...form,condition:e.target.value})}><option value="new">Novo</option><option value="near_mint">Near Mint</option><option value="played">Played</option></select></Field><Field label="Acabamento"><select value={form.finish} onChange={(e) => setForm({...form,finish:e.target.value})}><option value="standard">Padrão</option><option value="foil">Foil</option></select></Field></>}<Field label="Custo de aquisição"><input required type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({...form,cost:e.target.value})}/></Field><Field label="Preço de venda"><input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({...form,price:e.target.value})}/></Field><Field label="Quantidade"><input required type="number" min="0" step="1" value={form.quantity} onChange={(e) => setForm({...form,quantity:e.target.value})}/></Field><Field label="Margem mínima desejada (%)"><input required type="number" min="0" max="99" step="0.01" value={form.desiredMarginPercent} onChange={(e) => setForm({...form,desiredMarginPercent:e.target.value})}/></Field></div><div className="form-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary">Salvar produto</button></div></form>}</section></div>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field">{label}{children}</label>; }
function CardArtwork({ item, large = false }: { item: Item; large?: boolean }) { const image = item.imageUrl && /^https:\/\//i.test(item.imageUrl) ? item.imageUrl : null; return image ? <img className={large ? "product-art large" : "product-art"} src={image} alt={`Carta ${item.name}`} loading="lazy"/> : <div className={large ? "product-art-placeholder large" : "product-art-placeholder"} aria-label="Imagem indisponível">{item.name.slice(0,2).toUpperCase()}</div>; }
function ProductDetail({ item }: { item: Item }) { return <><p className="eyebrow">DETALHES DO PRODUTO</p><div className="product-detail-hero"><CardArtwork item={item} large/><div><h2>{item.name}</h2><p className="muted">{item.category} · SKU {item.sku}</p><p className="muted">{item.imageUrl ? "Imagem cadastrada para esta carta." : "Sem foto cadastrada. Cartas buscadas pelo cadastro inteligente podem trazer a imagem do catálogo."}</p></div></div><div className="detail-grid"><Detail label="Coleção / edição" value={item.set || "Não informada"}/><Detail label="Código" value={item.code || "Não informado"}/><Detail label="Idioma" value={cardLanguageLabel(item.language)}/><Detail label="Condição" value={cardConditionLabel(item.condition)}/><Detail label="Acabamento" value={cardFinishLabel(item.finish)}/><Detail label="Quantidade" value={String(item.stock)}/><Detail label="Custo" value={money.format(item.cost)}/><Detail label="Preço" value={money.format(item.currentPrice)}/><Detail label="Margem desejada" value={`${item.desiredMarginPercent}%`}/><Detail label="Mercado BRL verificado" value={item.marketPrice == null ? "Sem cotação compatível" : money.format(item.marketPrice)}/></div><ProductPriceGuidance items={[item]} detail/></>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
