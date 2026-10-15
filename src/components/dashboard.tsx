"use client";

/* eslint-disable @next/next/no-img-element -- Imagens HTTPS do catálogo já associado ao estoque. */
import { useMemo, useState } from "react";
import {
  Bell, CircleDollarSign, Download, Gauge, PackageSearch, Search, Sparkles,
  TrendingDown, TrendingUp, Upload, X, ArrowUpRight, Layers, Star,
} from "lucide-react";
import { calculateRecommendation } from "@/lib/pricing";
import type { DashboardData, Product } from "@/lib/types";
import { ImportCsvModal } from "./import-csv-modal";
import Link from "next/link";
import { TcgCardFan } from "./tcg-art";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function Dashboard({ initialData }: { initialData: DashboardData }) {
  const { products, alerts } = initialData;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const pageSize = 25;

  const summary = useMemo(() => {
    let totalStock = 0;
    let belowMinCount = 0;
    let suggestedCount = 0;
    let totalProjectedMargin = 0;
    let withoutMarketCount = 0;
    const { feePercent, additionalCostPercent, minimumMarginPercent, desiredMarginPercent, marketDiscountPercent } = initialData.pricing;

    for (let i = 0; i < products.length; i += 1) {
      const p = products[i];
      totalStock += p.stock;
      if (p.marketPrice == null) withoutMarketCount += 1;
      const effectiveMargin = Math.max(p.desiredMarginPercent, minimumMarginPercent, desiredMarginPercent);
      const rec = calculateRecommendation({
        cost: p.cost,
        feesPercent: feePercent,
        additionalCostsPercent: additionalCostPercent,
        desiredMarginPercent: effectiveMargin,
        marketDiscountPercent: marketDiscountPercent,
        marketPrice: p.marketPrice,
      });
      if (p.currentPrice < rec.minimumPrice) belowMinCount += 1;
      if (Math.abs(p.currentPrice - rec.suggestedPrice) >= 0.01) suggestedCount += 1;
      totalProjectedMargin += rec.projectedMargin;
    }

    const avgMargin = products.length > 0 ? (totalProjectedMargin / products.length).toFixed(1) : "0.0";
    return { totalStock, belowMinCount, suggestedCount, avgMargin, withoutMarketCount };
  }, [products, initialData.pricing]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.set.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q)
    );
  }, [query, products]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const exportProducts = () => {
    const escape = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["produto", "colecao", "codigo", "categoria", "custo", "preco", "mercado", "estoque"],
      ...filtered.map((product) => [product.name, product.set, product.code, product.category, product.cost, product.currentPrice, product.marketPrice, product.stock]),
    ];
    const blob = new Blob(["\uFEFF", rows.map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `geekprice-estoque-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-content dashboard-page">
      <section className="collection-hero">
        <div className="collection-hero-copy">
          <span className="tcg-kicker"><i/> SEU UNIVERSO TCG, EM ORDEM</span>
          <h1>Sua coleção.<br/><span>Seu próximo movimento.</span></h1>
          <p>Olá, {initialData.userName.split(" ")[0]}. Cuide das suas cartas, acompanhe o mercado e encontre espaço para crescer.</p>
          <div className="hero-stock-value"><span>Valor de venda em estoque</span><strong>{brl.format(products.reduce((total, product) => total + product.currentPrice * product.stock, 0))}</strong><small>Preços cadastrados × unidades em estoque</small></div>
          <Link href="/catalog" className="hero-collection-link">Explorar catálogo <ArrowUpRight size={17}/></Link>
        </div>
        <TcgCardFan cards={products.filter((product) => product.imageUrl).slice(0, 3)}/>
      </section>
      <div className="page-title dashboard-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="global-search" style={{ flex: 1, maxWidth: "480px" }}>
          <Search size={18} />
          <input
            aria-label="Buscar produtos no painel"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Buscar produto, coleção ou código..."
          />
        </div>
        <div className="page-actions">
          <button className="primary small" onClick={() => setImportOpen(true)}>
            <Upload size={17} />
            Importar estoque
          </button>
        </div>
      </div>

      {products.length === 0 && (
        <section
          className="panel"
          style={{
            padding: "20px 24px",
            marginBottom: 24,
            borderLeft: "4px solid #6366f1",
            background: "rgba(99, 102, 241, 0.05)",
          }}
        >
          <h2 style={{ fontSize: "1.15rem", margin: "0 0 6px 0", fontWeight: 600 }}>
            Bem-vindo ao GeekPrice! Primeiros passos da sua loja:
          </h2>
          <p style={{ margin: "0 0 16px 0", color: "var(--muted-foreground)", fontSize: "0.88rem", lineHeight: 1.5 }}>
            Seu ambiente está pronto. Para começar a gerenciar seu estoque e ativar a inteligência de precificação com o Autopilot, escolha uma opção:
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              href="/catalog"
              className="primary small"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
            >
              <Sparkles size={16} /> 1. Cadastrar Cartas pelo Catálogo (Pokémon / Magic)
            </Link>
            <Link
              href="/products"
              className="secondary small"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
            >
              <PackageSearch size={16} /> 2. Cadastrar Produto Avulso no Estoque
            </Link>
            <button
              className="secondary small"
              onClick={() => setImportOpen(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Upload size={16} /> 3. Importar Estoque via Planilha CSV
            </button>
          </div>
        </section>
      )}

      <section className="metrics">
        <Metric icon={<PackageSearch />} label="Produtos cadastrados" value={String(products.length)} detail="itens carregados" tone="violet" />
        <Metric icon={<Gauge />} label="Estoque total" value={String(summary.totalStock)} detail="unidades cadastradas" tone="green" />
        <Metric icon={<TrendingDown />} label="Abaixo do mínimo" value={String(summary.belowMinCount)} detail="exigem revisão" tone="red" />
        <Metric icon={<Sparkles />} label="Com ajuste sugerido" value={String(summary.suggestedCount)} detail="recomendações" tone="amber" />
        <Metric icon={<CircleDollarSign />} label="Margem média" value={`${summary.avgMargin}%`} detail="estimada" tone="green" />
        <Metric icon={<Bell />} label="Sem preço externo" value={String(summary.withoutMarketCount)} detail="sem referência" tone="violet" />
      </section>

      {filtered.length > 0 && <section className="collection-showcase" aria-label="Cartas do seu estoque">
        <div className="collection-section-title"><div><span className="eyebrow">CADA CARTA CONTA</span><h2>No seu estoque</h2></div><Link href="/products">Ver coleção <ArrowUpRight size={16}/></Link></div>
        <div className="collection-shelf">{filtered.slice(0, 5).map((product) => <button className="stock-collectible" key={product.id} onClick={() => setSelected(product)}>
          <div className="stock-collectible-art">{product.imageUrl?.startsWith("https://") ? <img src={product.imageUrl} alt={product.name} loading="lazy"/> : <div className="collectible-placeholder"><Layers size={32}/><span>{product.image}</span></div>}<span className="stock-collectible-quantity">{product.stock} un.</span></div>
          <span className="stock-collectible-name">{product.name}</span><small>{product.set} · {product.code}</small><strong>{brl.format(product.currentPrice)}</strong><span className="collectible-open">Analisar carta <ArrowUpRight size={13}/></span>
        </button>)}</div>
      </section>}

      <section className="grid-main">
        <PriceChart initialHistory={initialData.initialHistory} />
        <div className="panel alerts-panel">
          <div className="panel-title"><div><h2>Alertas recentes</h2><p>Movimentos que merecem atenção</p></div><Link href="/alerts">Ver todos</Link></div>
          <div className="alert-list">{alerts.map((alert) => <div className="alert" key={alert.id}><i className={alert.tone}/><div><strong>{alert.title}</strong><p>{alert.description}</p><span>{alert.time}</span></div></div>)}{alerts.length === 0 && <div className="tcg-empty"><Sparkles size={24}/><strong>Tudo tranquilo por aqui.</strong><p>Novos alertas da sua loja aparecem neste espaço.</p></div>}</div>
        </div>
      </section>

      <section className="panel products-panel">
        <div className="panel-title products-title"><div><h2>Produtos que precisam de atenção</h2><p>Priorizados pelo impacto potencial na sua margem</p></div><button className="secondary" onClick={exportProducts}><Download size={16}/>Exportar CSV</button></div>
        <div className="table-wrap"><table><thead><tr><th>PRODUTO</th><th>SEU PREÇO</th><th>MERCADO</th><th>DIFERENÇA</th><th>ESTOQUE</th><th>STATUS</th><th></th></tr></thead><tbody>
          {visibleProducts.map((product) => <ProductRow key={product.id} product={product} onOpen={() => setSelected(product)} />)}
        </tbody></table>{filtered.length === 0 && <div className="empty">{products.length === 0 ? "Seu estoque ainda não possui produtos. Utilize os botões de ação acima para cadastrar seus primeiros itens." : `Nenhum produto encontrado para “${query}”.`}</div>}</div>
        {filtered.length > pageSize && (
          <div className="pagination">
            <span>{filtered.length} produto(s) · página {page} de {totalPages}</span>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
          </div>
        )}
      </section>

      {selected && <RecommendationDrawer product={selected} pricing={initialData.pricing} onClose={() => setSelected(null)} />}
      {importOpen && <ImportCsvModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function Metric({ icon, label, value, detail, tone, up }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string; up?: boolean }) {
  return <article className={`metric metric-${tone}`}><div className="metric-card-top"><div className={`metric-icon ${tone}`}>{icon}</div><Star size={12}/></div><div><p>{label}</p><strong>{value}</strong><span className={up ? "positive" : ""}>{up && <TrendingUp size={14}/>} {detail}</span></div></article>;
}

function ProductRow({ product, onOpen }: { product: Product; onOpen: () => void }) {
  const difference = product.marketPrice ? ((product.currentPrice - product.marketPrice) / product.marketPrice) * 100 : null;
  const status = product.status === "attention" ? "Revisar preço" : product.status === "opportunity" ? "Oportunidade" : "Competitivo";
  return <tr><td><div className="product-cell">{product.imageUrl?.startsWith("https://") ? <img className="product-art" src={product.imageUrl} alt="" loading="lazy"/> : <div className={`product-thumb thumb-${Number(product.id.charCodeAt(0)) % 5 + 1}`}>{product.image}</div>}<div><strong>{product.name}</strong><span>{product.set} · {product.code}</span></div></div></td><td><strong>{brl.format(product.currentPrice)}</strong></td><td>{product.marketPrice == null ? "Sem dados" : brl.format(product.marketPrice)}</td><td>{difference == null ? <span className="muted">—</span> : <span className={difference < 0 ? "diff down" : "diff up"}>{difference > 0 ? "+" : ""}{difference.toFixed(1).replace(".", ",")}%</span>}</td><td>{product.stock} un.</td><td><span className={`status ${product.status}`}>{status}</span></td><td><button className="row-action" onClick={onOpen}>Analisar</button></td></tr>;
}

function PriceChart({ initialHistory }: { initialHistory?: DashboardData["initialHistory"] }) {
  const [days, setDays] = useState<number>(initialHistory?.days ?? 30);
  const [history, setHistory] = useState(initialHistory);
  const [loading, setLoading] = useState(false);

  const handlePeriodChange = async (selectedDays: number) => {
    setDays(selectedDays);
    setLoading(true);
    try {
      const res = await fetch(`/api/market/history?days=${selectedDays}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error("Erro ao carregar histórico de mercado:", e);
    } finally {
      setLoading(false);
    }
  };

  const points = history?.points ?? [];
  const hasValidData = Boolean(history?.hasData && points.length >= 2);

  return (
    <div className="panel chart-panel">
      <div className="panel-title">
        <div>
          <h2>Histórico e Posicionamento de Preços</h2>
          <p>
            {hasValidData
              ? `Médias apuradas a partir de ${history?.summary?.totalObservations ?? points.length} cotações reais em BRL`
              : "Histórico baseado em observações reais de mercado em BRL"}
          </p>
        </div>
        <select
          aria-label="Período"
          value={days}
          disabled={loading}
          onChange={(e) => handlePeriodChange(Number(e.target.value))}
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
      </div>

      {!hasValidData ? (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            minHeight: "220px",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "rgba(124, 92, 255, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={22} style={{ color: "#7c5cff" }} />
          </div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#f1f5f9", margin: 0 }}>
            Histórico de preços em construção
          </h3>
          <p style={{ fontSize: "0.875rem", color: "#94a3b8", maxWidth: "440px", margin: 0 }}>
            Os dados aparecerão conforme novas observações de mercado em BRL forem registradas e seus preços forem atualizados.
          </p>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
            Nenhuma cotação suficiente no período selecionado ({days} dias).
          </span>
        </div>
      ) : (
        <>
          <RealChartSvg points={points} summary={history?.summary} />
          <div className="chart-legend">
            <span><i className="you" />Seu preço médio</span>
            <span><i className="market" />Mercado BRL</span>
            {history?.summary && (
              <span style={{ marginLeft: "12px", color: "#a3a6b4" }}>
                Variação:{" "}
                <strong style={{ color: history.summary.percentageChange >= 0 ? "#10b981" : "#f43f5e" }}>
                  {history.summary.percentageChange >= 0 ? "+" : ""}
                  {history.summary.percentageChange}%
                </strong>{" "}
                · Mín: {brl.format(history.summary.minPrice)} · Máx: {brl.format(history.summary.maxPrice)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RealChartSvg({
  points,
  summary,
}: {
  points: Array<{ date: string; displayDate: string; marketPrice: number | null; storePrice: number | null }>;
  summary?: { minPrice: number; maxPrice: number; avgMarketPrice: number; percentageChange: number } | null;
}) {
  const width = 660;
  const height = 185;
  const validMarketPrices = points.map((p) => p.marketPrice).filter((p): p is number => p != null);
  const minP = summary?.minPrice ?? (validMarketPrices.length ? Math.min(...validMarketPrices) : 0);
  const maxP = summary?.maxPrice ?? (validMarketPrices.length ? Math.max(...validMarketPrices) : 100);

  const range = maxP - minP || 1;
  const padMin = Math.max(0, minP - range * 0.15);
  const padMax = maxP + range * 0.15;
  const padRange = padMax - padMin || 1;

  const getY = (val: number | null) => {
    if (val == null) return null;
    return height - ((val - padMin) / padRange) * (height - 35) - 15;
  };

  const getX = (idx: number) => {
    return (idx / (points.length - 1)) * width;
  };

  const marketCoords: Array<{ x: number; y: number }> = [];
  const storeCoords: Array<{ x: number; y: number }> = [];

  points.forEach((p, i) => {
    const x = getX(i);
    const my = getY(p.marketPrice);
    const sy = getY(p.storePrice);
    if (my != null) marketCoords.push({ x, y: my });
    if (sy != null) storeCoords.push({ x, y: sy });
  });

  const marketLinePath =
    marketCoords.length > 0
      ? `M ${marketCoords.map((c) => `${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" L ")}`
      : "";

  const marketAreaPath =
    marketCoords.length > 0
      ? `${marketLinePath} L ${marketCoords[marketCoords.length - 1].x.toFixed(1)} ${height} L ${marketCoords[0].x.toFixed(1)} ${height} Z`
      : "";

  const storeLinePath =
    storeCoords.length > 0
      ? `M ${storeCoords.map((c) => `${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" L ")}`
      : "";

  const yLabels = [padMax, padMin + padRange * 0.66, padMin + padRange * 0.33, padMin].map((v) =>
    brl.format(Math.round(v))
  );

  const step = Math.max(1, Math.floor(points.length / 6));
  const xLabels = points.filter((_, i) => i === 0 || i === points.length - 1 || i % step === 0);

  return (
    <div className="chart">
      <div className="axis">
        {yLabels.map((label, idx) => (
          <span key={idx}>{label}</span>
        ))}
      </div>
      <div className="grid-lines">
        <i /><i /><i /><i />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Evolução do preço médio">
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity=".20" />
            <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {marketAreaPath && <path className="area" d={marketAreaPath} />}
        {marketLinePath && <path className="line market-line" d={marketLinePath} />}
        {storeLinePath && <path className="line you-line" d={storeLinePath} />}
        {marketCoords.length > 0 && (
          <circle cx={marketCoords[marketCoords.length - 1].x} cy={marketCoords[marketCoords.length - 1].y} r={5} />
        )}
      </svg>
      <div className="x-axis">
        {xLabels.map((p, idx) => (
          <span key={idx}>{p.displayDate}</span>
        ))}
      </div>
    </div>
  );
}

function RecommendationDrawer({ product, pricing, onClose }: { product: Product; pricing: DashboardData["pricing"]; onClose: () => void }) {
  const desiredMargin = Math.max(product.desiredMarginPercent, pricing.minimumMarginPercent, pricing.desiredMarginPercent);
  const result = calculateRecommendation({ cost: product.cost, feesPercent: pricing.feePercent, additionalCostsPercent: pricing.additionalCostPercent, desiredMarginPercent: desiredMargin, marketDiscountPercent: pricing.marketDiscountPercent, marketPrice: product.marketPrice });
  return <div className="drawer-layer" onMouseDown={onClose}><aside className="drawer" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={onClose}><X /></button><p className="eyebrow">RECOMENDAÇÃO EXPLICÁVEL</p><h2>{product.name}</h2><p className="drawer-sub">{product.set} · {product.code}</p><div className="recommendation"><CircleDollarSign/><span>Preço sugerido</span><strong>{brl.format(result.suggestedPrice)}</strong><small>Margem projetada de {result.projectedMargin.toFixed(1).replace(".", ",")}%</small></div><div className="calculation"><h3>Como calculamos</h3><div><span>Custo informado</span><strong>{brl.format(product.cost)}</strong></div><div><span>Taxas de marketplace</span><strong>{pricing.feePercent}%</strong></div><div><span>Custos adicionais</span><strong>{pricing.additionalCostPercent}%</strong></div><div><span>Margem aplicada</span><strong>{desiredMargin}%</strong></div><div><span>Preço mínimo sustentável</span><strong>{brl.format(result.minimumPrice)}</strong></div><div><span>Referência do mercado</span><strong>{product.marketPrice == null ? "Dados indisponíveis" : brl.format(product.marketPrice)}</strong></div></div><div className="insight"><Sparkles/><p>{product.marketPrice == null ? "Sem preço externo, a recomendação usa somente custo, taxas e margem mínima." : "O preço recomendado preserva sua margem e considera a referência observada."}</p></div><button className="primary full" onClick={onClose}>Entendi a recomendação</button></aside></div>;
}
