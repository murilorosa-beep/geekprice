"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { SmartRegistrationModal } from "@/components/smart-registration-modal";

type Item = { id: string; name: string; category: string; set: string | null; code: string | null; sku: string; cost: number; currentPrice: number; stock: number; desiredMarginPercent: number; marketPrice: number | null; language: string; condition: string; finish: string };
type Result = { items: Item[]; total: number; page: number; pageSize: number };
const emptyForm = { name: "", category: "", sku: "", setName: "", collectorNumber: "", language: "pt-BR", condition: "new", finish: "standard", cost: "0", price: "0", quantity: "0", desiredMarginPercent: "25" };

export function ProductManager({ initial }: { initial?: Result }) {
  const router = useRouter();
  const [smartOpen, setSmartOpen] = useState(false);
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

  function openCreate() { setSelected(null); setForm(emptyForm); setModal("create"); setError(""); }
  function openEdit(item: Item) { setSelected(item); setForm({ ...emptyForm, cost: String(item.cost), price: String(item.currentPrice), quantity: String(item.stock), desiredMarginPercent: String(item.desiredMarginPercent) }); setModal("edit"); setError(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const payload = modal === "edit" ? { cost: form.cost, price: form.price, quantity: form.quantity, desiredMarginPercent: form.desiredMarginPercent } : form;
    const response = await fetch(modal === "edit" ? `/api/inventory/${selected?.id}` : "/api/inventory", { method: modal === "edit" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) return setError(body?.error ?? "Não foi possível salvar.");
    setModal(null); setFeedback(modal === "edit" ? "Produto atualizado." : "Produto cadastrado."); await load();
  }
  async function remove(item: Item) {
    if (!window.confirm(`Excluir ${item.name} do estoque? Esta ação não pode ser desfeita.`)) return;
    const response = await fetch(`/api/inventory/${item.id}`, { method: "DELETE" });
    if (!response.ok) { const body = await response.json(); return setError(body.error ?? "Não foi possível excluir."); }
    setFeedback("Produto excluído do estoque."); await load();
  }
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return <div className="page-content"><div className="page-title"><div><p className="eyebrow">ESTOQUE DA ORGANIZAÇÃO</p><h1>Produtos</h1><p>Cadastre produtos e mantenha custos, preços e quantidades atualizados.</p></div><div className="page-actions"><button className="secondary" onClick={() => setSmartOpen(true)}>Cadastro Inteligente</button><button className="primary small" onClick={openCreate}><Plus size={17}/>Novo produto</button></div></div>
    {feedback && <div className="feedback">{feedback}</div>}{error && <div className="form-error">{error}</div>}
    {smartOpen && <SmartRegistrationModal onClose={() => setSmartOpen(false)} onCreated={async () => { setFeedback("Carta cadastrada e vinculada ao catálogo."); await load(); }}/>} 
    <div className="filters"><input aria-label="Buscar produtos" placeholder="Buscar nome, coleção, código ou categoria" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }}/><input aria-label="Categoria" placeholder="Categoria" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}/><select value={availability} onChange={(e) => { setAvailability(e.target.value); setPage(1); }}><option value="all">Toda disponibilidade</option><option value="in_stock">Em estoque</option><option value="out_of_stock">Sem estoque</option></select></div>
    <section className="panel products-panel"><div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>SKU</th><th>CUSTO</th><th>PREÇO</th><th>ESTOQUE</th><th>MARGEM</th><th>AÇÕES</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td><div className="product-cell"><div className="product-thumb thumb-3">{item.name.slice(0,2).toUpperCase()}</div><div><strong>{item.name}</strong><span>{item.set || "Sem coleção"} · {item.category}</span></div></div></td><td>{item.sku}</td><td>R$ {item.cost.toFixed(2)}</td><td>R$ {item.currentPrice.toFixed(2)}</td><td>{item.stock}</td><td>{item.desiredMarginPercent}%</td><td><div className="page-actions"><button className="row-action" aria-label="Detalhes" onClick={() => { setSelected(item); setModal("detail"); }}><Eye size={16}/></button><button className="row-action" aria-label="Editar" onClick={() => openEdit(item)}><Pencil size={16}/></button><button className="row-action danger" aria-label="Excluir" onClick={() => remove(item)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{!loading && data.items.length === 0 && <div className="empty">Nenhum produto corresponde aos filtros.</div>}{loading && <div className="empty">Carregando produtos...</div>}</div><div className="pagination"><span>{data.total} produto(s) · página {page} de {pages}</span><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><button disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></section>
    {modal && <div className="drawer-layer" onMouseDown={() => setModal(null)}><section className="modal-card" onMouseDown={(e) => e.stopPropagation()}><button className="drawer-close" onClick={() => setModal(null)}><X/></button>{modal === "detail" && selected ? <ProductDetail item={selected}/> : <form onSubmit={save}><p className="eyebrow">{modal === "edit" ? "ATUALIZAR ESTOQUE" : "NOVO ITEM"}</p><h2>{modal === "edit" ? selected?.name : "Cadastrar produto"}</h2>{modal === "edit" && <p className="muted">Dados globais do catálogo permanecem imutáveis; altere os dados privados da sua loja.</p>}<div className="form-grid">{modal === "create" && <><Field label="Nome"><input required minLength={2} value={form.name} onChange={(e) => setForm({...form,name:e.target.value})}/></Field><Field label="Categoria"><input required value={form.category} onChange={(e) => setForm({...form,category:e.target.value})}/></Field><Field label="SKU"><input required value={form.sku} onChange={(e) => setForm({...form,sku:e.target.value})}/></Field><Field label="Coleção / edição"><input value={form.setName} onChange={(e) => setForm({...form,setName:e.target.value})}/></Field><Field label="Código / número"><input value={form.collectorNumber} onChange={(e) => setForm({...form,collectorNumber:e.target.value})}/></Field><Field label="Idioma"><input value={form.language} onChange={(e) => setForm({...form,language:e.target.value})}/></Field><Field label="Condição"><select value={form.condition} onChange={(e) => setForm({...form,condition:e.target.value})}><option value="new">Novo</option><option value="near_mint">Near Mint</option><option value="played">Played</option></select></Field><Field label="Acabamento"><select value={form.finish} onChange={(e) => setForm({...form,finish:e.target.value})}><option value="standard">Padrão</option><option value="foil">Foil</option></select></Field></>}<Field label="Custo de aquisição"><input required type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({...form,cost:e.target.value})}/></Field><Field label="Preço de venda"><input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({...form,price:e.target.value})}/></Field><Field label="Quantidade"><input required type="number" min="0" step="1" value={form.quantity} onChange={(e) => setForm({...form,quantity:e.target.value})}/></Field><Field label="Margem mínima desejada (%)"><input required type="number" min="0" max="99" step="0.01" value={form.desiredMarginPercent} onChange={(e) => setForm({...form,desiredMarginPercent:e.target.value})}/></Field></div><div className="form-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary">Salvar produto</button></div></form>}</section></div>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field">{label}{children}</label>; }
function ProductDetail({ item }: { item: Item }) { return <><p className="eyebrow">DETALHES DO PRODUTO</p><h2>{item.name}</h2><p className="muted">{item.category} · {item.sku}</p><div className="detail-grid"><Detail label="Coleção / edição" value={item.set || "Não informada"}/><Detail label="Código" value={item.code || "Não informado"}/><Detail label="Idioma" value={item.language}/><Detail label="Condição" value={item.condition}/><Detail label="Acabamento" value={item.finish}/><Detail label="Quantidade" value={String(item.stock)}/><Detail label="Custo" value={`R$ ${item.cost.toFixed(2)}`}/><Detail label="Preço" value={`R$ ${item.currentPrice.toFixed(2)}`}/><Detail label="Margem desejada" value={`${item.desiredMarginPercent}%`}/><Detail label="Mercado" value={item.marketPrice == null ? "Sem dados externos" : `R$ ${item.marketPrice.toFixed(2)}`}/></div></>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
