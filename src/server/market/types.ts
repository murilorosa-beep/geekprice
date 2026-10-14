export type ExternalCard = {
  id: string; name: string; localId: string | null; setId: string | null;
  setName: string | null; rarity: string | null; image: string | null;
  language: string; finishes: string[];
};

export type ExternalPrice = {
  externalVariantId: string; sourceMarket: string; currency: "USD" | "EUR";
  price: number; finish: string; condition: string | null; referenceAt: Date;
  url: string | null; raw: Record<string, unknown>;
};

export interface CatalogConnector {
  readonly id: string;
  search(input: { name?: string; set?: string; number?: string; language: string; limit?: number }): Promise<ExternalCard[]>;
  getCard(id: string, language: string): Promise<ExternalCard & { prices: ExternalPrice[] }>;
}
