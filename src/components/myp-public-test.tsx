"use client";

import { useState } from "react";

type Card = {
  code: string;
  name: string;
  edition: string;
  min: string | null;
  avg: string | null;
  max: string | null;
  quantity: number | null;
  link: string;
};

type Result = { game: string; page: number; cards: Card[]; fetchedAt: string; fromSwagger?: boolean };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function price(value: string | null) {
  const amount = Number(value);
  return value != null && Number.isFinite(amount) ? money.format(amount) : "—";
}

export function MypPublicTest() {
  const [game, setGame] = useState("pokemon");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pastedJson, setPastedJson] = useState("");

  async function consult() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/market/myp-public-test?game=${game}&page=${page}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar o MYP.");
    } finally {
      setLoading(false);
    }
  }

  function showSwaggerResponse() {
    setError("");
    try {
      const body: unknown = JSON.parse(pastedJson);
      if (!body || typeof body !== "object" || !("cards" in body) || !Array.isArray(body.cards)) {
        throw new Error("Cole o Response body completo, com a lista cards.");
      }
      const cards: Card[] = body.cards.slice(0, 50).map((value: unknown) => {
        const card = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return {
          code: String(card.card_code ?? ""),
          name: String(card.name_pt || card.name_en || ""),
          edition: String(card.edition_pt || card.edition_en || card.edition_code || ""),
          min: card.min_price == null ? null : String(card.min_price),
          avg: card.avg_price == null ? null : String(card.avg_price),
          max: card.max_price == null ? null : String(card.max_price),
          quantity: typeof card.available_quantity === "number" ? card.available_quantity : null,
          link: typeof card.link === "string" && card.link.startsWith("https://mypcards.com/") ? card.link : "https://mypcards.com/",
        };
      });
      setResult({ game, page, cards, fetchedAt: new Date().toISOString(), fromSwagger: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "JSON invalido.");
    }
  }

  return (
    <main style={{ maxWidth: 1050, margin: "0 auto", padding: 24 }}>
      <h1>Teste da API pública MYP Cards</h1>
      <p>Consulta anônima da listagem de preços. Apenas visualização local; não grava cotações nem altera preços do estoque.</p>
      <div style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap", margin: "24px 0" }}>
        <label>Jogo<br /><select value={game} onChange={(event) => { setGame(event.target.value); setResult(null); }}><option value="pokemon">Pokémon</option><option value="magic">Magic</option></select></label>
        <label>Página<br /><input type="number" min={1} max={20} value={page} onChange={(event) => setPage(Number(event.target.value))} style={{ width: 85 }} /></label>
        <button type="button" onClick={consult} disabled={loading || page < 1 || page > 20}>{loading ? "Consultando..." : "Consultar MYP"}</button>
      </div>
      <details style={{ marginBottom: 20 }}>
        <summary>Teste com o JSON obtido no Swagger</summary>
        <p>Se a consulta do servidor receber 403, copie apenas o Response body do Swagger e cole aqui. Este teste não envia o JSON ao servidor.</p>
        <textarea value={pastedJson} onChange={(event) => setPastedJson(event.target.value)} rows={6} placeholder='{"page_number":1,"cards":[...]}' style={{ width: "100%" }} />
        <button type="button" onClick={showSwaggerResponse}>Mostrar cartas do JSON</button>
      </details>
      {error && <p role="alert" style={{ color: "#ef4444" }}>{error}</p>}
      {result && <>
        <p>{result.cards.length} cartas {result.fromSwagger ? "coladas do Swagger" : "retornadas pela API"} na página {result.page}. {result.fromSwagger ? "JSON colado não comprova conexão do aplicativo ao MYP. " : `Consulta: ${new Date(result.fetchedAt).toLocaleString("pt-BR")}. `}Preços anunciados, não vendas concluídas.</p>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th>Carta</th><th>Edição</th><th>Mínimo</th><th>Médio</th><th>Máximo</th><th>Ofertas</th></tr></thead><tbody>
          {result.cards.map((card, index) => <tr key={`${card.code}-${index}`}><td style={{ padding: 8 }}><a href={card.link} target="_blank" rel="noopener noreferrer">{card.name || card.code}</a><br /><small>{card.code}</small></td><td style={{ padding: 8 }}>{card.edition || "—"}</td><td style={{ padding: 8 }}>{price(card.min)}</td><td style={{ padding: 8 }}>{price(card.avg)}</td><td style={{ padding: 8 }}>{price(card.max)}</td><td style={{ padding: 8 }}>{card.quantity ?? "—"}</td></tr>)}
        </tbody></table></div>
      </>}
      <p style={{ marginTop: 24 }}>Dados: <a href="https://mypcards.com/" target="_blank" rel="noopener noreferrer">MYP Cards</a>. Limite local: uma consulta a cada 7 segundos.</p>
    </main>
  );
}
