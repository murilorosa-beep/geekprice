import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  externalListings,
  inventoryItems,
  priceObservations,
  productVariants,
  products,
  sources,
} from "@/db/schema";
import { verifyBrazilianQuote } from "./brazilian-sources";

export class InvalidQuoteTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidQuoteTokenError";
  }
}

export class QuoteMismatchError extends Error {
  constructor(public code: "NAME_MISMATCH" | "EDITION_MISMATCH" | "NUMBER_MISMATCH" | "FINISH_MISMATCH" | "AMBIGUOUS_MATCH", message: string) {
    super(message);
    this.name = "QuoteMismatchError";
  }
}

export class ItemNotFoundError extends Error {
  constructor(message = "Item de estoque não encontrado para esta organização.") {
    super(message);
    this.name = "ItemNotFoundError";
  }
}

function cleanString(str?: string | null): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCollectorNumber(num?: string | null): string {
  if (!num) return "";
  // Normaliza "025/165" -> "25", "025" -> "25", "#25" -> "25"
  const base = num.split("/")[0].replace(/\D/g, "");
  return base.replace(/^0+/, "");
}

/**
 * Valida correspondência estrita entre a cotação nacional e o cadastro do estoque.
 * Bloqueia misturas de cartas diferentes, edições divergentes, números incorretos ou ambiguidades.
 */
export function validateQuoteInventoryMatch(
  item: {
    productName: string;
    setName: string | null;
    collectorNumber: string | null;
    finish: string;
    condition: string;
    language: string;
  },
  quote: {
    cardTitle?: string;
    edition?: string;
    collectorNumber?: string;
  }
) {
  const normItemName = cleanString(item.productName);
  const normQuoteName = cleanString(quote.cardTitle);

  if (normQuoteName) {
    // 1. Verificação de modificadores de raridade/forma (VMAX, VSTAR, EX, GX, etc.)
    const specialTokens = ["vmax", "vstar", "ex", "gx", "v", "radiant", "brilhante", "prime", "break"];
    for (const token of specialTokens) {
      const itemHas = normItemName.split(" ").includes(token);
      const quoteHas = normQuoteName.split(" ").includes(token);
      if (itemHas !== quoteHas) {
        throw new QuoteMismatchError(
          "NAME_MISMATCH",
          `Divergência na variante da carta: o produto no estoque é "${item.productName}", mas a cotação selecionada é "${quote.cardTitle}". Verifique se é ${token.toUpperCase()}.`
        );
      }
    }

    // 2. O nome básico deve ser compatível
    if (
      normItemName !== normQuoteName &&
      !normQuoteName.includes(normItemName) &&
      !normItemName.includes(normQuoteName)
    ) {
      throw new QuoteMismatchError(
        "NAME_MISMATCH",
        `O nome da carta cotada ("${quote.cardTitle}") não corresponde ao produto cadastrado no estoque ("${item.productName}").`
      );
    }
  }

  // 3. Verificação de Edição / Coleção
  const normItemSet = cleanString(item.setName);
  const normQuoteEdition = cleanString(quote.edition);

  if (normItemSet && normQuoteEdition) {
    // Permite correspondência por prefixo/inclusão (ex: "151" vs "Escarlate e Violeta 151" ou "VIV" vs "Vivid Voltage")
    const isSubset =
      normItemSet.includes(normQuoteEdition) || normQuoteEdition.includes(normItemSet);

    if (normItemSet !== normQuoteEdition && !isSubset) {
      throw new QuoteMismatchError(
        "EDITION_MISMATCH",
        `Divergência de coleção: a cotação é da edição "${quote.edition}", mas o produto no seu estoque pertence a "${item.setName}".`
      );
    }
  } else if (normItemSet && !normQuoteEdition) {
    // Bloqueia gravação ambígua quando o estoque tem edição definida mas a cotação não especifica
    throw new QuoteMismatchError(
      "AMBIGUOUS_MATCH",
      `A cotação selecionada não possui edição informada, enquanto o estoque está registrado na coleção "${item.setName}". Selecione a edição exata para evitar referências incorretas.`
    );
  }

  // 4. Verificação de Número do Colecionador
  const normItemNum = cleanCollectorNumber(item.collectorNumber);
  const normQuoteNum = cleanCollectorNumber(quote.collectorNumber);

  if (normItemNum && normQuoteNum && normItemNum !== normQuoteNum) {
    throw new QuoteMismatchError(
      "NUMBER_MISMATCH",
      `Divergência de numeração: o produto no estoque é o nº ${item.collectorNumber}, mas a cotação selecionada refere-se ao nº ${quote.collectorNumber}.`
    );
  }
}

export async function persistBrazilianQuoteForInventoryItem(
  organizationId: string,
  inventoryItemId: string,
  quote: {
    sourceLabel: string;
    price: number;
    url?: string;
    edition?: string;
    collectorNumber?: string;
    cardTitle?: string;
    token?: string;
    observedAt?: string;
  }
) {
  if (!quote.price || quote.price <= 0) {
    throw new Error("O preço da cotação deve ser maior que zero.");
  }

  // Requirement 1: Validação do token assinado pelo servidor
  if (!quote.token) {
    throw new InvalidQuoteTokenError(
      "Esta cotação não possui token de validação do servidor. Atualize a consulta antes de vincular."
    );
  }

  const tokenVerification = verifyBrazilianQuote(quote.token, {
    source: quote.sourceLabel.toLowerCase().includes("magic") ? "ligamagic" : "ligapokemon",
    cardTitle: quote.cardTitle || "",
    edition: quote.edition,
    collectorNumber: quote.collectorNumber,
    price: quote.price,
    url: quote.url,
    observedAt: quote.observedAt,
  });

  if (!tokenVerification.valid) {
    throw new InvalidQuoteTokenError(
      tokenVerification.reason || "Cotação adulterada, inválida ou expirada."
    );
  }

  return db.transaction(async (tx) => {
    // 1. Localizar item do estoque e sua variante com isolamento estrito por organização
    const [item] = await tx
      .select({
        id: inventoryItems.id,
        variantId: inventoryItems.variantId,
        cost: inventoryItems.cost,
        currentPrice: inventoryItems.price,
        productName: products.name,
        setName: productVariants.setName,
        collectorNumber: productVariants.collectorNumber,
        finish: productVariants.finish,
        condition: productVariants.condition,
        language: productVariants.language,
        sku: inventoryItems.organizationSku,
      })
      .from(inventoryItems)
      .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(inventoryItems.id, inventoryItemId),
          eq(inventoryItems.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!item) {
      throw new ItemNotFoundError("Item do estoque não encontrado para esta organização.");
    }

    // 2. Validação de correspondência de nome, edição, número e acabamento
    validateQuoteInventoryMatch(
      {
        productName: item.productName,
        setName: item.setName,
        collectorNumber: item.collectorNumber,
        finish: item.finish,
        condition: item.condition,
        language: item.language,
      },
      {
        cardTitle: quote.cardTitle,
        edition: quote.edition,
        collectorNumber: quote.collectorNumber,
      }
    );

    // 3. Obter ou criar a fonte com metadados claros de referência externa não homologada
    const sourceName = quote.sourceLabel || "Liga Pokémon";
    const [existingSource] = await tx
      .select({ id: sources.id })
      .from(sources)
      .where(
        and(
          eq(sources.organizationId, organizationId),
          eq(sources.name, sourceName),
          eq(sources.kind, "partner_csv")
        )
      )
      .limit(1);

    let sourceId: string;
    if (existingSource) {
      sourceId = existingSource.id;
    } else {
      const [newSource] = await tx
        .insert(sources)
        .values({
          organizationId,
          name: sourceName,
          kind: "partner_csv",
          active: true,
          config: {
            region: "BR",
            currency: "BRL",
            type: "unverified_national_reference",
            verified: false,
            sourcePlatform: sourceName,
            commercialHomologation: false,
          },
        })
        .returning({ id: sources.id });
      sourceId = newSource.id;
    }

    // 4. Obter ou criar o external listing correspondente
    const sourceSlug = sourceName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const externalKey = `br-quote:${item.variantId}:${sourceSlug}`.slice(0, 240);
    const observationDate = quote.observedAt ? new Date(quote.observedAt) : new Date();

    const [listing] = await tx
      .insert(externalListings)
      .values({
        sourceId,
        variantId: item.variantId,
        externalId: externalKey,
        url: quote.url || null,
        sellerName: sourceName,
        metadata: {
          sourceName,
          edition: quote.edition,
          collectorNumber: quote.collectorNumber,
          trust: "unverified_public_quote",
          verified: false,
          tokenValid: true,
          collectedAt: quote.observedAt || observationDate.toISOString(),
          importedAt: new Date().toISOString(),
        },
      })
      .onConflictDoUpdate({
        target: [externalListings.sourceId, externalListings.externalId],
        set: {
          url: quote.url || null,
          sellerName: sourceName,
          updatedAt: new Date(),
        },
      })
      .returning({ id: externalListings.id });

    // 5. Inserir a observação de preço em BRL preservando procedência completa
    const fingerprint = createHash("sha256")
      .update(
        `${item.variantId}:${sourceId}:${quote.price.toFixed(2)}:${observationDate.toISOString().slice(0, 10)}`
      )
      .digest("hex");

    const [observation] = await tx
      .insert(priceObservations)
      .values({
        listingId: listing.id,
        price: quote.price.toFixed(2),
        currency: "BRL",
        region: "BR",
        type: "reference",
        available: true,
        referenceAt: observationDate,
        fingerprint,
        rawPayload: {
          source: sourceName,
          priceType: "asking_price_aggregate",
          priceSubtype: "unverified_listing_reference",
          collectedAt: quote.observedAt || observationDate.toISOString(),
          verifiedSource: false,
          warning: "Referência pública não-homologada. Requer validação humana antes de aplicação em vendas.",
          url: quote.url,
        },
      })
      .onConflictDoNothing({ target: priceObservations.fingerprint })
      .returning();

    // 6. Alerta de divergência em relação ao preço cadastrado
    const currentPriceNum = Number(item.currentPrice);
    if (currentPriceNum > 0) {
      const diffPercent = ((currentPriceNum - quote.price) / quote.price) * 100;
      if (Math.abs(diffPercent) >= 20) {
        await tx.insert(alerts).values({
          organizationId,
          title: `Cotação BR vinculada para ${item.productName}`,
          message: `Referência externa (${sourceName}) registrada a R$ ${quote.price.toFixed(2)}. Seu preço atual é R$ ${currentPriceNum.toFixed(2)} (${diffPercent > 0 ? "+" : ""}${diffPercent.toFixed(1)}%). O Autopilot manterá a sugestão pendente de aprovação manual por ser uma fonte não verificada.`,
          severity: diffPercent < -15 ? "warning" : "info",
        });
      }
    }

    return {
      success: true,
      observationId: observation?.id ?? "existing",
      productName: item.productName,
      priceRecorded: quote.price,
      currency: "BRL",
      sourceName,
      verifiedSource: false,
      requiresManualApproval: true,
    };
  });
}
