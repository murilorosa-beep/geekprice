import { redirect } from "next/navigation";
import { requireBillingAdministrator } from "@/server/billing/admin";
import { getIndexCoverage, getIndexSources } from "@/server/geekprice-index/service";
import { GeekPriceIndexAdminImport } from "@/components/geekprice-index-admin-import";

export const metadata = { title: "GeekPrice Index — Administração" };

export default async function GeekPriceIndexAdminPage() {
  const administrator = await requireBillingAdministrator();
  if (!administrator) redirect("/dashboard");
  const [coverage, sources] = await Promise.all([getIndexCoverage(), getIndexSources()]);
  return <div className="page-content">
    <div className="page-title"><div><p className="eyebrow">ADMINISTRAÇÃO DA PLATAFORMA</p><h1>GeekPrice Index — Administração</h1><p>Estado da base própria de preços brasileiros. Cotações são anúncios, não vendas concluídas.</p></div></div>
    <div className="platform-grid">
      <article className="panel" style={{ padding: 24 }}><h2>{coverage.cards}</h2><p>cartas cadastradas</p></article>
      <article className="panel" style={{ padding: 24 }}><h2>{coverage.priced}</h2><p>cartas com preço BRL</p></article>
      <article className="panel" style={{ padding: 24 }}><h2>{coverage.unpriced}</h2><p>impressões sem preço</p></article>
      <article className="panel" style={{ padding: 24 }}><h2>{coverage.currentPriced}</h2><p>preços vistos nos últimos 30 dias</p></article>
      <article className="panel" style={{ padding: 24 }}><h2>{coverage.uniquePrintings}</h2><p>impressões únicas por jogo, edição e número</p></article>
      <article className="panel" style={{ padding: 24 }}><h2>{coverage.knownVariants}</h2><p>variantes com idioma, acabamento e condição conhecidos</p></article>
      <article className="panel" style={{ padding: 24 }}><h2>{coverage.observations}</h2><p>observações históricas</p></article>
      <article className="panel" style={{ padding: 24 }}><h2>{coverage.ambiguous}</h2><p>correspondências ambíguas</p></article>
      <article className="panel" style={{ padding: 24 }}><h2>{coverage.stale}</h2><p>referências desatualizadas (&gt;30 dias)</p></article>
      <article className="panel" style={{ padding: 24 }}><h2>{coverage.collectionErrors}</h2><p>erros de coleta registrados</p></article>
    </div>
    <p className="gi-stock-warning">Cobertura do catálogo: ainda não aferida. O piloto partiu de buscas que já tinham preço; {coverage.priced}/{coverage.cards} registros carregados não representam a porcentagem do mercado. Impressões sem preço: {coverage.unpriced} na base atual.</p>
    <section className="panel" style={{ padding: 24, marginTop: 24 }}><h2>Fontes</h2>
      <p>Última atualização: {coverage.lastUpdate ? new Date(coverage.lastUpdate).toLocaleString("pt-BR") : "nenhuma"}</p>
      {sources.map((source) => <div key={source.code} style={{ marginTop: 12 }}><strong>{source.name}</strong> · {source.active ? "ativa" : "indisponível"} · último sucesso {source.lastSuccessAt ? new Date(source.lastSuccessAt).toLocaleString("pt-BR") : "não registrado"} · último erro {source.lastErrorAt ? new Date(source.lastErrorAt).toLocaleString("pt-BR") : "nenhum"}</div>)}
    </section>
    <GeekPriceIndexAdminImport enabled={process.env.INDEX_IMPORT_ENABLED === "true" && process.env.APP_ENV !== "production"} />
    <section className="panel" style={{ padding: 24, marginTop: 24 }}><h2>Operação controlada</h2>
      <p>Importação e atualização do piloto usam banco local isolado. Nenhuma rotina recorrente está ativada.</p>
      <p>Arquivo inicial: <code>data/geekprice-index/mypcards-pilot.tsv</code>. Para lotes grandes, use <code>scripts/import-geekprice-index-csv.ts</code> com arquivo e metadados de procedência.</p>
    </section>
  </div>;
}
