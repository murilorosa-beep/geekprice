import "server-only";

import type { CommerceConnector, CommerceProduct, SyncCursor } from "./types";
import { safeWooGet, validateStoreUrl } from "./safe-request";

export type WooCommerceCredentials = {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

export class WooCommerceConnector implements CommerceConnector {
  readonly kind = "woocommerce" as const;
  readonly mode = "read_only" as const;

  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(private readonly credentials: WooCommerceCredentials) {
    if (!credentials.storeUrl) {
      throw new Error("URL da loja WooCommerce é obrigatória.");
    }
    if (!credentials.consumerKey || !credentials.consumerSecret) {
      throw new Error("Consumer Key e Consumer Secret do WooCommerce são obrigatórios.");
    }

    this.baseUrl = validateStoreUrl(credentials.storeUrl.trim()).origin;
    const token = Buffer.from(
      `${credentials.consumerKey.trim()}:${credentials.consumerSecret.trim()}`
    ).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  async testConnection(): Promise<{ ok: boolean; message: string; details?: Record<string, unknown> }> {
    try {
      const endpoint = `${this.baseUrl}/wp-json/wc/v3/system_status`;
      const response = await safeWooGet(new URL(endpoint), this.authHeader, 10_000);

      if (response.status === 200) {
        return { ok: true, message: "Conexão com WooCommerce estabelecida com sucesso." };
      }

      // Fallback para endpoint de produtos caso system_status esteja bloqueado por segurança do host
      const fallback = await safeWooGet(new URL(`${this.baseUrl}/wp-json/wc/v3/products?per_page=1`), this.authHeader, 10_000);

      if (fallback.status === 200) {
        return { ok: true, message: "Conexão com catálogo WooCommerce verificada com sucesso." };
      }

      if (fallback.status === 401 || fallback.status === 403) {
        return { ok: false, message: "Autenticação rejeitada pelo WooCommerce: confira Consumer Key e Secret." };
      }

      return {
        ok: false,
        message: `Falha na verificação com a loja (HTTP ${fallback.status}). Verifique a URL e a API REST.`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Erro ao conectar com a loja WooCommerce: ${msg}` };
    }
  }

  async pullProducts(cursor: SyncCursor): Promise<{
    items: CommerceProduct[];
    nextCursor: string | null;
    total?: number;
  }> {
    const page = cursor.page ?? (cursor.cursor ? parseInt(cursor.cursor, 10) : 1);
    const perPage = Math.min(cursor.perPage ?? 50, 100);

    const url = new URL(`${this.baseUrl}/wp-json/wc/v3/products`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("status", "publish");

    if (cursor.updatedAfter) {
      url.searchParams.set("after", cursor.updatedAfter.toISOString());
    }

    const response = await safeWooGet(url, this.authHeader, 20_000);

    if (response.status === 429) {
      throw new Error("Limite de requisições excedido na API da loja WooCommerce (HTTP 429). Aguarde alguns segundos.");
    }

    if (!response.ok) {
      throw new Error(`Erro na consulta de produtos WooCommerce: HTTP ${response.status} ${response.statusText}`);
    }

    const totalPagesHeader = response.headers.get("x-wp-totalpages");
    const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;
    const totalItemsHeader = response.headers.get("x-wp-total");
    const totalItems = totalItemsHeader ? parseInt(totalItemsHeader, 10) : undefined;

    const rawData = await response.json();
    if (!Array.isArray(rawData)) {
      throw new Error("Resposta inesperada do WooCommerce: formato de catálogo inválido.");
    }

    const items: CommerceProduct[] = [];

    for (const raw of rawData) {
      if (!raw || typeof raw !== "object" || (raw.status && raw.status !== "publish")) continue;
      if (raw.type === "variable") {
        const parentId = Number(raw.id);
        if (!Number.isSafeInteger(parentId) || parentId <= 0) continue;
        let variationPage = 1;
        let variationPages = 1;
        do {
          if (variationPage > 100) throw new Error("Produto variável excede o limite de 10.000 variações por prévia.");
          const variationUrl = new URL(`${this.baseUrl}/wp-json/wc/v3/products/${parentId}/variations`);
          variationUrl.searchParams.set("page", String(variationPage));
          variationUrl.searchParams.set("per_page", "100");
          variationUrl.searchParams.set("status", "publish");
          const variationResponse = await safeWooGet(variationUrl, this.authHeader, 20_000);
          if (!variationResponse.ok) throw new Error(`Erro na consulta de variações WooCommerce: HTTP ${variationResponse.status}`);
          const variations = await variationResponse.json();
          if (!Array.isArray(variations)) throw new Error("Formato de variações WooCommerce inválido.");
          variationPages = Number(variationResponse.headers.get("x-wp-totalpages") || 1);
          if (!Number.isSafeInteger(variationPages) || variationPages < 1 || variationPages > 100) throw new Error("Paginação de variações inválida ou excessiva.");
          for (const variation of variations) {
            if (!variation || typeof variation !== "object" || (variation.status && variation.status !== "publish")) continue;
            const attrs = Array.isArray(variation.attributes) ? variation.attributes.filter((attr: Record<string, unknown>) => attr?.option).map((attr: Record<string, unknown>) => ({ name: attr.name, options: [attr.option] })) : [];
            const p = this.parseWooProduct({
              ...raw, ...variation, id: raw.id,
              name: `${raw.name} — ${attrs.map((attr: { options: unknown[] }) => attr.options[0]).join(" / ") || variation.id}`,
              attributes: attrs,
              categories: raw.categories,
              sku: variation.sku || "",
            });
            if (p) {
              p.externalVariantId = String(variation.id);
              items.push(p);
            }
          }
          variationPage++;
        } while (variationPage <= variationPages);
      } else if (!raw.type || raw.type === "simple") {
        const p = this.parseWooProduct(raw);
        if (p) items.push(p);
      }
    }

    const nextCursor = page < totalPages ? String(page + 1) : null;

    return {
      items,
      nextCursor,
      total: totalItems,
    };
  }

  private parseWooProduct(raw: Record<string, unknown>): CommerceProduct | null {
    if (!raw || typeof raw !== "object" || !raw.id) return null;

    const externalId = String(raw.id);
    const name = String(raw.name || "").trim();
    if (!name) return null;

    const sku = raw.sku && typeof raw.sku === "string" && raw.sku.trim() ? raw.sku.trim() : null;
    const priceStr = raw.price !== undefined && raw.price !== null ? String(raw.price).trim() : null;
    const regularPriceStr =
      raw.regular_price !== undefined && raw.regular_price !== null ? String(raw.regular_price).trim() : null;

    // WooCommerce não armazena custo de aquisição nativamente a menos que haja plugin específico
    // Custo NUNCA é inventado
    let costStr: string | null = null;
    if (Array.isArray(raw.meta_data)) {
      const costMeta = raw.meta_data.find(
        (m: Record<string, unknown>) =>
          m && (m.key === "_cost" || m.key === "_wc_cog_cost" || m.key === "acquisition_cost")
      );
      if (costMeta && costMeta.value) {
        costStr = String(costMeta.value).trim();
      }
    }

    let quantity: number | null = null;
    if (raw.manage_stock === true && raw.stock_quantity !== null && raw.stock_quantity !== undefined) {
      quantity = Math.max(0, parseInt(String(raw.stock_quantity), 10) || 0);
    } else if (raw.stock_status === "outofstock") {
      quantity = 0;
    }

    // Categoria
    let category: string | null = null;
    if (Array.isArray(raw.categories) && raw.categories.length > 0) {
      category = String(raw.categories[0].name || "").trim() || null;
    }

    // Código de barras / EAN
    let barcode: string | null = null;
    if (Array.isArray(raw.meta_data)) {
      const eanMeta = raw.meta_data.find(
        (m: Record<string, unknown>) => m && (m.key === "barcode" || m.key === "_barcode" || m.key === "ean" || m.key === "_ean")
      );
      if (eanMeta && eanMeta.value) {
        barcode = String(eanMeta.value).trim();
      }
    }

    // Imagem
    let imageUrl: string | null = null;
    if (Array.isArray(raw.images) && raw.images.length > 0 && raw.images[0]?.src) {
      imageUrl = String(raw.images[0].src);
    }

    // Atributos de TCG (Idioma, Condição, Acabamento, Coleção)
    let language: string | null = "pt-BR";
    let condition: string | null = "NM";
    let finish: string | null = "standard";
    let setName: string | null = null;
    let collectorNumber: string | null = null;

    if (Array.isArray(raw.attributes)) {
      for (const attr of raw.attributes) {
        if (!attr || typeof attr !== "object") continue;
        const attrName = String(attr.name || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
        const option = Array.isArray(attr.options) && attr.options.length > 0 ? String(attr.options[0]).trim() : null;
        if (!option) continue;

        if (attrName.includes("idioma") || attrName.includes("language")) {
          language = option;
        } else if (attrName.includes("condi") || attrName.includes("condition")) {
          condition = option;
        } else if (attrName.includes("acabamento") || attrName.includes("finish") || attrName.includes("foil")) {
          finish = option;
        } else if (attrName.includes("cole") || attrName.includes("set") || attrName.includes("edi")) {
          setName = option;
        } else if (attrName.includes("nume") || attrName.includes("number")) {
          collectorNumber = option;
        }
      }
    }

    let updatedAt: Date | null = null;
    const modified = typeof raw.date_modified_gmt === "string"
      ? (/Z$|[+-]\d\d:\d\d$/.test(raw.date_modified_gmt) ? raw.date_modified_gmt : `${raw.date_modified_gmt}Z`)
      : raw.date_modified;
    if (modified && typeof modified === "string") {
      const d = new Date(modified);
      if (!isNaN(d.getTime())) updatedAt = d;
    }

    return {
      externalId,
      sku,
      name,
      price: priceStr,
      regularPrice: regularPriceStr,
      cost: costStr,
      quantity,
      category,
      barcode,
      imageUrl,
      language,
      condition,
      finish,
      setName,
      collectorNumber,
      updatedAt,
    };
  }
}
