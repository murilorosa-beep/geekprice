export type CommerceProduct = {
  externalId: string;
  externalVariantId?: string | null;
  sku: string | null;
  name: string;
  variant?: string | null;
  price: string | null;
  regularPrice?: string | null;
  cost: string | null; // Custo de aquisição se disponível no ERP/e-commerce, nunca inventado
  quantity: number | null;
  category: string | null;
  barcode: string | null;
  imageUrl?: string | null;
  language?: string | null;
  condition?: string | null;
  finish?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  updatedAt: Date | null;
};

export type SyncCursor = {
  cursor: string | null;
  updatedAfter: Date | null;
  page?: number;
  perPage?: number;
};

export interface CommerceConnector {
  readonly kind: "bling_v3" | "nuvemshop" | "woocommerce";
  readonly mode: "read_only";
  testConnection(): Promise<{ ok: boolean; message: string; details?: Record<string, unknown> }>;
  pullProducts(cursor: SyncCursor): Promise<{ items: CommerceProduct[]; nextCursor: string | null; total?: number }>;
}

export type ReconciliationStatus =
  | "exact_match"
  | "probable_match"
  | "new_product"
  | "conflict"
  | "insufficient_data";

export type ReconciledItem = {
  externalId: string;
  externalVariantId?: string | null;
  name: string;
  sku: string | null;
  barcode?: string | null;
  category?: string | null;
  price: number | null;
  regularPrice?: number | null;
  cost: number | null;
  quantity: number;
  language: string;
  condition: string;
  finish: string;
  setName?: string | null;
  collectorNumber?: string | null;
  status: ReconciliationStatus;
  reason: string;
  matchedInventoryItemId?: string | null;
  matchedProductName?: string | null;
  matchedVariantId?: string | null;
  currentGeekPrice?: number | null;
  currentStock?: number | null;
  conflictDetails?: string | null;
};

export type ImportPreviewResult = {
  connectionId: string;
  provider: string;
  totalFetched: number;
  exactMatches: number;
  probableMatches: number;
  newProducts: number;
  conflicts: number;
  insufficientData: number;
  items: ReconciledItem[];
  previewToken: string;
  expiresAt: string;
};

export type ImportCommitInput = {
  connectionId: string;
  previewToken: string;
  selectedExternalIds?: string[];
  confirmedProbableMatches?: Array<{
    externalId: string;
    externalVariantId?: string | null;
    inventoryItemId: string;
  }>;
};

export type ImportCommitResult = {
  syncRunId: string;
  status: "completed" | "partial" | "failed";
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  conflictCount: number;
  errorCount: number;
  errors: Array<{ externalId?: string; message: string }>;
};
