import type { IndicativeMarketReference } from "@/lib/index-reference";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function IndexReferenceSummary({ reference, currentPrice }: { reference?: IndicativeMarketReference | null; currentPrice: number }) {
  if (!reference) return <span>Sem referência no Index</span>;
  return <div className="gi-stock-warning"><strong>Index BRL: {money.format(reference.price)}</strong>
    <small> · Indicativa · confiança {reference.confidence} ({reference.score.toFixed(2)})</small>
    <p><a href={reference.sourceUrl} target="_blank" rel="noopener noreferrer">{reference.source}</a> · {new Date(reference.observedAt).toLocaleDateString("pt-BR")}
      {reference.stale && " · desatualizada"}</p>
    <small>Seu preço: {money.format(currentPrice)} · diferença {money.format(currentPrice - reference.price)}.
      Condição, idioma e acabamento podem diferir. Exige revisão manual.</small></div>;
}
