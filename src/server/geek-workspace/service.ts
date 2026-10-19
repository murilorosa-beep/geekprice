import "server-only";
import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { geekCollectionItems, geekCommissions } from "@/db/schema";
import { estimateCommission, type CollectionInput, type CommissionInput, type ResourceQuery } from "@/lib/geek-workspace";

export class WorkspaceError extends Error {
  constructor(public status: 404 | 409 | 422, message: string) { super(message); }
}
const PAGE_SIZE = 24;
const searchPattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
export async function listCollection(organizationId: string, query: ResourceQuery) {
  const table = geekCollectionItems;
  const filter = and(eq(table.organizationId, organizationId),
    query.q ? or(ilike(table.title, searchPattern(query.q)), ilike(table.series, searchPattern(query.q)), ilike(table.edition, searchPattern(query.q))) : undefined,
    query.category ? eq(table.category, sql`${query.category}`) : undefined, query.status ? eq(table.status, sql`${query.status}`) : undefined,
    query.minPrice !== undefined ? gte(table.purchasePrice, query.minPrice.toFixed(2)) : undefined,
    query.maxPrice !== undefined ? lte(table.purchasePrice, query.maxPrice.toFixed(2)) : undefined);
  const [items, [total], [summary], albums] = await Promise.all([
    db.select().from(table).where(filter).orderBy(desc(table.updatedAt), desc(table.id)).limit(PAGE_SIZE).offset((query.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(table).where(filter),
    db.select({
      owned: sql<number>`coalesce(sum(case when ${table.status} in ('owned','loaned') then ${table.quantity} else 0 end),0)::int`,
      wishlist: sql<number>`count(*) filter (where ${table.status} = 'wishlist')::int`,
      loaned: sql<number>`count(*) filter (where ${table.status} = 'loaned')::int`,
      invested: sql<string>`coalesce(sum(case when ${table.status} in ('owned','loaned') then ${table.purchasePrice} * ${table.quantity} else 0 end),0)::text`,
    }).from(table).where(eq(table.organizationId, organizationId)),
    db.select({
      category: table.category,
      entries: count(),
      total: sql<number>`coalesce(sum(${table.quantity}),0)::int`,
      owned: sql<number>`coalesce(sum(case when ${table.status} in ('owned','loaned') then ${table.quantity} else 0 end),0)::int`,
    }).from(table).where(eq(table.organizationId, organizationId)).groupBy(table.category),
  ]);
  return { items, total: total.total, page: query.page, pageSize: PAGE_SIZE, summary: { ...summary, albums } };
}

export async function listCommissions(organizationId: string, query: ResourceQuery) {
  const table = geekCommissions;
  const filter = and(eq(table.organizationId, organizationId),
    query.q ? or(ilike(table.title, searchPattern(query.q)), ilike(table.customer, searchPattern(query.q))) : undefined,
    query.category ? eq(table.category, sql`${query.category}`) : undefined, query.status ? eq(table.status, sql`${query.status}`) : undefined);
  const [items, [total], [summary], stages] = await Promise.all([
    db.select().from(table).where(filter).orderBy(desc(table.updatedAt), desc(table.id)).limit(PAGE_SIZE).offset((query.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(table).where(filter),
    db.select({
      open: sql<number>`count(*) filter (where ${table.status} not in ('delivered','canceled'))::int`,
      production: sql<number>`count(*) filter (where ${table.status} = 'production')::int`,
      overdue: sql<number>`count(*) filter (where ${table.status} not in ('delivered','canceled') and ${table.dueAt} <> '' and ${table.dueAt} < to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD'))::int`,
      receivable: sql<string>`coalesce(sum(case when ${table.status} not in ('quote','canceled') then ${table.totalPrice} - ${table.paidAmount} else 0 end),0)::text`,
    }).from(table).where(eq(table.organizationId, organizationId)),
    db.select({ status: table.status, total: count() }).from(table).where(eq(table.organizationId, organizationId)).groupBy(table.status),
  ]);
  return { items: items.map((item) => ({ ...item, estimate: estimateCommission(item) })), total: total.total, page: query.page, pageSize: PAGE_SIZE, summary: { ...summary, stages } };
}

export async function saveCollection(organizationId: string, input: CollectionInput, id?: string, version?: number) {
  const table = geekCollectionItems;
  if (id) {
    const [item] = await db.update(table).set({ ...input, version: sql`${table.version} + 1`, updatedAt: new Date() })
      .where(and(eq(table.organizationId, organizationId), eq(table.id, id), eq(table.version, version!))).returning();
    if (!item) await throwMissingOrConflict("collections", organizationId, id);
    return item;
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 31))`);
    const [total] = await tx.select({ total: count() }).from(table).where(eq(table.organizationId, organizationId));
    if (total.total >= 5000) throw new WorkspaceError(422, "Limite de 5.000 cadastros na coleção atingido.");
    const [item] = await tx.insert(table).values({ ...input, organizationId }).returning();
    return item;
  });
}

export async function saveCommission(organizationId: string, input: CommissionInput, id?: string, version?: number) {
  const table = geekCommissions;
  if (id) {
    const [item] = await db.update(table).set({ ...input, version: sql`${table.version} + 1`, updatedAt: new Date() })
      .where(and(eq(table.organizationId, organizationId), eq(table.id, id), eq(table.version, version!))).returning();
    if (!item) await throwMissingOrConflict("commissions", organizationId, id);
    return item;
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 32))`);
    const [total] = await tx.select({ total: count() }).from(table).where(eq(table.organizationId, organizationId));
    if (total.total >= 5000) throw new WorkspaceError(422, "Limite de 5.000 encomendas atingido.");
    const [item] = await tx.insert(table).values({ ...input, organizationId }).returning();
    return item;
  });
}

async function throwMissingOrConflict(kind: "collections" | "commissions", organizationId: string, id: string): Promise<never> {
  const table = kind === "collections" ? geekCollectionItems : geekCommissions;
  const [existing] = await db.select({ id: table.id }).from(table).where(and(eq(table.organizationId, organizationId), eq(table.id, id))).limit(1);
  throw existing ? new WorkspaceError(409, "Este cadastro foi alterado em outra tela. Feche e atualize a lista antes de editar novamente.") : new WorkspaceError(404, "Cadastro não encontrado.");
}
export async function deleteWorkspaceItem(kind: "collections" | "commissions", organizationId: string, id: string, version: number) {
  const table = kind === "collections" ? geekCollectionItems : geekCommissions;
  const [deleted] = await db.delete(table).where(and(eq(table.organizationId, organizationId), eq(table.id, id), eq(table.version, version))).returning({ id: table.id });
  if (!deleted) await throwMissingOrConflict(kind, organizationId, id);
}
