export type IndicativeMarketReference = {
  cardId: string; price: number; source: string; sourceUrl: string; observedAt: string;
  lastSeenAt: string; confidence: string; score: number; stale: boolean;
  indicativeOnly: true; autoApplyEligible: false;
};
