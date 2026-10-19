import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { indexCards, indexImports, indexSources } from "@/db/schema";
import { INDEX_CSV_HEADER, parseIndexImportCsv } from "@/server/geekprice-index/import-csv";
import { importIndexCsv } from "@/server/geekprice-index/import-service";

const sourceCode = "index_test_catalog";
beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!/^geekprice_phase81_test_\d+$/.test(process.env.PHASE81_TEST_DATABASE ?? "") ||
    url.hostname !== "127.0.0.1" || url.pathname !== `/${process.env.PHASE81_TEST_DATABASE}`)
    throw new Error("A integração do Index exige PostgreSQL local isolado.");
});
afterAll(async () => {
  const [source] = await db.select({ id: indexSources.id }).from(indexSources)
    .where(eq(indexSources.code, sourceCode)).limit(1);
  if (!source) return;
  await db.delete(indexImports).where(eq(indexImports.sourceId, source.id));
  await db.delete(indexCards).where(eq(indexCards.catalogSource, sourceCode));
  await db.delete(indexSources).where(eq(indexSources.id, source.id));
});

describe("importação do Index em lotes", () => {
  it("preserva mil impressões sem preço, cursor e idempotência", async () => {
    const lines = Array.from({ length: 1001 }, (_, i) =>
      `pokemon,Test Card ${i + 1},test-set-${i + 1},Test Set,TST,${i + 1},,en,,,,,,,,`);
    const csv = [INDEX_CSV_HEADER, ...lines].join("\n");
    const parsed = parseIndexImportCsv(csv, {
      sourceCode, sourceName: "Catálogo de teste sem preços", sourceBaseUrl: "https://example.test",
      acquisitionMethod: "public_historical_archive", rightsReference: "fixture local de integração; nenhum preço",
      sourceSnapshotAt: new Date().toISOString(),
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.pricedRows).toBe(0);
    expect(parsed.unpricedRows).toBe(1001);
    const first = await importIndexCsv(parsed, "test-catalog.csv", 200);
    expect(first).toMatchObject({ status: "completed", totalRows: 1001, pricedRows: 0, unpricedRows: 1001 });
    const again = await importIndexCsv(parsed, "test-catalog.csv", 200);
    expect(again).toMatchObject({ importId: first.importId, status: "completed", resumed: true });
    const [count] = await db.select({ value: sql<number>`count(*)::int` }).from(indexCards)
      .where(eq(indexCards.catalogSource, sourceCode));
    expect(count.value).toBe(1001);
    const [record] = await db.select({ cursor: indexImports.cursor }).from(indexImports)
      .where(eq(indexImports.id, first.importId));
    expect(record.cursor).toBe(1001);
  });
});
