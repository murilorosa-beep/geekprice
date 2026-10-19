import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { indexCards, indexImports, indexObservations, indexSources } from "@/db/schema";
import { quoteFingerprint } from "./core";
import type { IndexImportRow, parseIndexImportCsv } from "./import-csv";

type Parsed = ReturnType<typeof parseIndexImportCsv>;

export async function importIndexCsv(parsed: Parsed, fileName: string, batchSize = 200) {
  if (parsed.errors.length || parsed.validRows !== parsed.totalRows) throw new Error("Corrija todas as linhas inválidas antes de importar.");
  if (parsed.totalRows === 0) throw new Error("O CSV não contém impressões para importar.");
  if (batchSize < 1 || batchSize > 500) throw new Error("Lote inválido.");
  const [source] = await db.insert(indexSources).values({ code: parsed.meta.sourceCode,
    name: parsed.meta.sourceName, baseUrl: parsed.meta.sourceBaseUrl, active: true,
    commercialApproved: false, acquisitionMethod: parsed.meta.acquisitionMethod,
    rightsReference: parsed.meta.rightsReference,
  }).onConflictDoNothing().returning();
  const existingSource = source ?? (await db.select().from(indexSources).where(eq(indexSources.code, parsed.meta.sourceCode)).limit(1))[0];
  if (!existingSource || existingSource.baseUrl !== parsed.meta.sourceBaseUrl ||
    (existingSource.rightsReference && existingSource.rightsReference !== parsed.meta.rightsReference))
    throw new Error("A fonte já existe com origem ou direitos diferentes. Use outro código de fonte.");
  const [created] = await db.insert(indexImports).values({ sourceId: existingSource.id, fileHash: parsed.hash,
    fileName: fileName.slice(0, 240), acquisitionMethod: parsed.meta.acquisitionMethod,
    rightsReference: parsed.meta.rightsReference, sourceSnapshotAt: new Date(parsed.meta.sourceSnapshotAt),
    totalRows: parsed.totalRows, validRows: parsed.validRows, pricedRows: parsed.pricedRows,
    unpricedRows: parsed.unpricedRows, status: "running", cursor: 0, errors: [],
  }).onConflictDoNothing().returning();
  let record = created ?? (await db.select().from(indexImports).where(and(eq(indexImports.sourceId, existingSource.id),
    eq(indexImports.fileHash, parsed.hash))).limit(1))[0];
  if (!record) throw new Error("Falha ao registrar a importação.");
  if (record.rightsReference !== parsed.meta.rightsReference || record.sourceSnapshotAt.toISOString() !== parsed.meta.sourceSnapshotAt)
    throw new Error("Arquivo já registrado com procedência ou data diferentes.");
  if (record.status === "completed") return { importId: record.id, status: "completed", pricedRows: record.pricedRows,
    unpricedRows: record.unpricedRows, totalRows: record.totalRows, resumed: true };
  try {
    for (let start = record.cursor; start < parsed.rows.length; start += batchSize) {
      const chunk = parsed.rows.slice(start, start + batchSize);
      await db.transaction(async (tx) => {
        for (const row of chunk) await upsertRow(tx, row, existingSource.id, parsed.meta.sourceCode);
        const next = start + chunk.length;
        await tx.update(indexImports).set({ cursor: next, status: next === parsed.rows.length ? "completed" : "running" })
          .where(eq(indexImports.id, record.id));
      });
    }
  } catch (cause) {
    await db.update(indexImports).set({ status: "failed", errors: [{ row: record.cursor + 2,
      message: cause instanceof Error ? cause.message : "Falha na importação." }] }).where(eq(indexImports.id, record.id));
    throw cause;
  }
  [record] = await db.select().from(indexImports).where(eq(indexImports.id, record.id)).limit(1);
  return { importId: record.id, status: record.status, pricedRows: record.pricedRows,
    unpricedRows: record.unpricedRows, totalRows: record.totalRows, resumed: Boolean(!created) };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function upsertRow(tx: Tx, row: IndexImportRow, sourceId: string, sourceCode: string) {
  const [card] = await tx.insert(indexCards).values({ game: row.game, catalogSource: sourceCode,
    canonicalId: row.canonicalId, name: row.name, setName: row.setName, setCode: row.setCode,
    collectorNumber: row.collectorNumber, imageUrl: row.imageUrl, language: row.language,
    finish: row.finish, condition: row.condition, matchStatus: "exact",
    coverageStatus: row.quote ? "priced" : "unpriced",
  }).onConflictDoUpdate({ target: [indexCards.game, indexCards.catalogSource, indexCards.canonicalId],
    set: { name: row.name, setName: row.setName, setCode: row.setCode,
      collectorNumber: row.collectorNumber, imageUrl: row.imageUrl,
      coverageStatus: row.quote ? "priced" : sql`${indexCards.coverageStatus}`, updatedAt: new Date() },
  }).returning({ id: indexCards.id });
  if (!row.quote) return;
  const quote = row.quote;
  const fingerprint = createHash("sha256").update(`${sourceCode}|${quoteFingerprint(quote)}`).digest("hex");
  await tx.insert(indexObservations).values({ cardId: card.id, sourceId,
    sourceExternalId: quote.sourceExternalId, sourceUrl: quote.sourceUrl,
    priceMin: quote.priceMin, providerAverage: quote.providerAverage, priceMax: quote.priceMax,
    availableQuantity: quote.availableQuantity, language: quote.language, finish: quote.finish,
    condition: quote.condition, observedAt: quote.observedAt, lastSeenAt: quote.observedAt, fingerprint,
  }).onConflictDoUpdate({ target: indexObservations.fingerprint,
    set: { lastSeenAt: sql`greatest(${indexObservations.lastSeenAt}, ${quote.observedAt.toISOString()}::timestamptz)`,
      sourceUrl: quote.sourceUrl },
  });
}
