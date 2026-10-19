/* eslint-disable @next/next/no-img-element -- Imagem vem do catálogo associado ao produto. */
"use client";

import { useCallback, useEffect, useState } from "react";

type Candidate = { card: { id: string; name: string; setName: string; collectorNumber: string;
  language: string | null; finish: string | null; condition: string | null; imageUrl: string | null };
  match: "exact" | "probable"; reference: null | { providerAverage: string | null; askingMin: string;
    askingMax: string; observedAt: string; lastSeenAt: string; source: { name: string; url: string };
    quality: { score: number; level: string }; status: string } };
type Context = { item: { id: string; name: string; imageUrl: string | null; setName: string | null;
  collectorNumber: string | null; language: string; finish: string; condition: string;
  cost: string; currentPrice: string }; status: string; candidates: Candidate[]; linkedCardId: string | null;
  totalCandidates: number };
type Preview = Context & { pricing: null | { referenceValue: string; referenceKind: string; feePercent: number;
  additionalCostPercent: number; desiredMarginPercent: number; minimumMarginPercent: number; minimumPrice: number; suggestedPrice: number;
  projectedMargin: number; percentageChange: number; safetyReason: string; canManuallyApprove: boolean };
  reason: string | null };
type Change = { batchId: string; status: string; appliedAt: string; revertedAt: string | null;
  previousPrice: string; newPrice: string };
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: string | number) => brl.format(Number(value));

export function GeekPriceIndexStock({ itemId, canManage, onClose, onPriceChanged }: {
  itemId: string; canManage: boolean; onClose: () => void; onPriceChanged: () => Promise<void> }) {
  const [context, setContext] = useState<Context | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<Change[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const load = useCallback(async () => {
    const base = `/api/geekprice-index/v1/inventory/${itemId}`;
    const [matchesResponse, previewResponse, historyResponse] = await Promise.all([
      fetch(base), fetch(`${base}/preview`), fetch(`${base}/history`)]);
    const [matches, pricing, changes] = await Promise.all([matchesResponse.json(), previewResponse.json(), historyResponse.json()]);
    if (!matchesResponse.ok || !previewResponse.ok || !historyResponse.ok)
      throw new Error(matches.error ?? pricing.error ?? changes.error ?? "Falha ao consultar o Index.");
    setContext(matches.data); setPreview(pricing.data); setHistory(changes.data);
  }, [itemId]);
  useEffect(() => { let active = true; void Promise.resolve().then(load).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao consultar o Index."); });
    return () => { active = false; }; }, [load]);
  async function select(cardId: string) {
    setBusy(true); setError(""); setConfirmed(false);
    try {
      const response = await fetch(`/api/geekprice-index/v1/inventory/${itemId}`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível vincular a impressão.");
      await load(); setFeedback("Impressão escolhida. Revise a variante antes de aprovar uma sugestão.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao vincular."); }
    finally { setBusy(false); }
  }
  async function approve() {
    if (!preview?.linkedCardId || !confirmed) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/geekprice-index/v1/inventory/${itemId}/approve`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: preview.linkedCardId,
          confirmedVariant: true, expectedCurrentPrice: preview.item.currentPrice }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível aprovar a sugestão.");
      setFeedback(`Preço atualizado para ${money(body.data.newPrice)}. O lote pode ser revertido no histórico abaixo.`);
      setConfirmed(false); await load(); await onPriceChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na aprovação."); }
    finally { setBusy(false); }
  }
  async function rollback(batchId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/autopilot/rollback", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível reverter o lote.");
      setFeedback("Preço anterior restaurado."); await load(); await onPriceChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha no rollback."); }
    finally { setBusy(false); }
  }
  const selected = preview?.candidates.find((candidate) => candidate.card.id === preview.linkedCardId);
  return <div className="drawer-layer" onMouseDown={onClose}><section className="modal-card gi-stock-dialog" role="dialog" aria-modal="true"
    aria-label="GeekPrice Index e sugestão de preço" onMouseDown={(event) => event.stopPropagation()}>
    <button className="drawer-close" type="button" onClick={onClose} aria-label="Fechar">×</button>
    <p className="eyebrow">MERCADO · INDEX BRL</p><h2>Referência para sua carta</h2>
    {error && <div className="form-error" role="alert">{error}</div>}{feedback && <div className="feedback" role="status">{feedback}</div>}
    {!context ? <p>Consultando edições e preços armazenados...</p> : <>
      <div className="gi-stock-hero">{context.item.imageUrl?.startsWith("https://") ? <img src={context.item.imageUrl} alt={`Carta ${context.item.name}`} /> : <span className="gi-art">TCG</span>}
        <div><h3>{context.item.name}</h3><p>{context.item.setName ?? "Coleção não informada"} · nº {context.item.collectorNumber ?? "não informado"}</p>
          <small>{context.item.language} · {context.item.finish} · {context.item.condition}</small></div></div>
      <p className="gi-stock-warning">O Index identifica a impressão. A fonte do piloto não informa idioma, acabamento nem condição; confirme sua variante antes de decidir o preço.</p>
      {context.candidates.length === 0 ? <div className="gi-stock"><h3>Sem correspondência no Index</h3><p>Esta edição ainda não tem referência brasileira na base pesquisada. Nenhum preço foi estimado.</p></div> :
        <div className="gi-stock"><h3>{context.status === "ambiguous" ? "Escolha a edição correta" : "Edições encontradas"}</h3>
          <p>{context.totalCandidates} candidata(s). Correspondências prováveis exigem revisão; somente a impressão exata selecionada pode gerar a sugestão supervisionada.</p>
          {context.candidates.map((candidate) => <div className="gi-stock-candidate" key={candidate.card.id}>
            <div><strong>{candidate.card.name} · {candidate.card.setName} · nº {candidate.card.collectorNumber}</strong>
              <small>{candidate.match === "exact" ? "Impressão exata" : "Correspondência provável"} · {candidate.reference ? money(candidate.reference.providerAverage ?? candidate.reference.askingMin) : "Sem preço"}
                {candidate.reference && ` · ${new Date(candidate.reference.lastSeenAt).toLocaleDateString("pt-BR")}`}</small></div>
            {context.linkedCardId === candidate.card.id ? <span className="gi-match-pill">Selecionada</span> : canManage ?
              <button type="button" className="secondary small" disabled={busy} onClick={() => void select(candidate.card.id)}>Escolher</button> : null}
          </div>)}</div>}
      {selected?.reference && preview?.pricing && <div className="gi-stock"><h3>Simulação financeira supervisionada</h3>
        <p>Fonte: <a href={selected.reference.source.url} target="_blank" rel="noopener noreferrer">{selected.reference.source.name}</a> · observado em {new Date(selected.reference.observedAt).toLocaleString("pt-BR")}
          · qualidade {selected.reference.quality.level} ({selected.reference.quality.score.toFixed(2)}) · {selected.reference.status === "stale" ? "referência antiga" : "referência atual"}</p>
        <div className="gi-stock-metrics"><div><span>Referência BRL ({preview.pricing.referenceKind === "provider_average" ? "média da fonte" : "mínimo anunciado"})</span><strong>{money(preview.pricing.referenceValue)}</strong></div>
          <div><span>Seu preço atual</span><strong>{money(preview.item.currentPrice)}</strong></div><div><span>Custo</span><strong>{money(preview.item.cost)}</strong></div>
          <div><span>Taxas e custos adicionais</span><strong>{preview.pricing.feePercent}% + {preview.pricing.additionalCostPercent}%</strong></div>
          <div><span>Preço mínimo rentável</span><strong>{money(preview.pricing.minimumPrice)}</strong></div>
          <div><span>Sugestão · margem projetada {preview.pricing.projectedMargin.toFixed(1)}%</span><strong>{money(preview.pricing.suggestedPrice)}</strong></div></div>
        <p>Justificativa: referência da fonte com desconto da política de preços, respeitando custo, taxas e margem mínima de {preview.pricing.minimumMarginPercent}%.
          Variação de {preview.pricing.percentageChange.toFixed(1)}%. {preview.pricing.safetyReason}</p>
        {canManage && <div className="gi-stock-actions"><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Confirmei idioma, acabamento, condição e a impressão.</label>
          <button type="button" className="primary" disabled={!confirmed || !preview.pricing.canManuallyApprove || busy || Math.abs(preview.pricing.percentageChange) > 15}
            onClick={() => void approve()}>Aprovar preço manualmente</button></div>}
        {!preview.pricing.canManuallyApprove && <p className="gi-stock-warning">Aplicação indisponível: esta fonte ainda não foi homologada para uso comercial ou a referência está antiga. A simulação não altera o estoque.</p>}
      </div>}
      {history.length > 0 && <div className="gi-stock"><h3>Histórico e rollback</h3>{history.map((change) => <div className="gi-stock-candidate" key={change.batchId}>
        <div><strong>{money(change.previousPrice)} → {money(change.newPrice)}</strong><small>{new Date(change.appliedAt).toLocaleString("pt-BR")} · {change.status === "reverted" ? "revertido" : "aplicado"}</small></div>
        {canManage && change.status === "applied" && <button type="button" className="secondary small" disabled={busy} onClick={() => void rollback(change.batchId)}>Reverter</button>}
      </div>)}</div>}
    </>}
  </section></div>;
}
