import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { collectionInputSchema, commissionInputSchema } from "@/lib/geek-workspace";
import { deleteWorkspaceItem, listCollection, listCommissions, saveCollection, saveCommission } from "@/server/geek-workspace/service";

const ids: string[] = [];
const query = { q: "", category: "", status: "", page: 1 };
const book = collectionInputSchema.parse({ title: "Volume 100%_literal", category: "manga", status: "owned", quantity: 2, purchasePrice: "30" });
const order = commissionInputSchema.parse({ title: "Peça 3D", category: "print3d", customer: "Cliente de teste", quantity: 1, status: "approved", materials: [{ name: "Filamento", quantity: 2.5, unitCost: "20" }], laborHours: "3", hourlyRate: "30", extraCosts: "10", marginPercent: "25", totalPrice: "200", paidAmount: "50" });
beforeAll(async () => {
  const target = new URL(process.env.DATABASE_URL!);
  if (!/^geekprice_phase81_test_\d+$/.test(process.env.PHASE81_TEST_DATABASE || "") || target.pathname !== `/${process.env.PHASE81_TEST_DATABASE}`) throw new Error("Banco isolado obrigatório.");
  const orgs = await db.insert(organizations).values([0, 1].map((n) => ({ name: `TESTE Geek workspace ${n}`, slug: `geek-workspace-${randomUUID()}` }))).returning({ id: organizations.id });
  ids.push(...orgs.map((org) => org.id));
});
afterAll(async () => { if (ids.length) await db.delete(organizations).where(inArray(organizations.id, ids)); });
describe("persistência e isolamento da suíte geek", () => {
  it("não revela nem altera coleção de outra organização", async () => {
    const item = await saveCollection(ids[0], book);
    expect((await listCollection(ids[1], query)).total).toBe(0);
    await expect(saveCollection(ids[1], { ...book, title: "Invasão" }, item.id, item.version)).rejects.toMatchObject({ status: 404 });
    await expect(deleteWorkspaceItem("collections", ids[1], item.id, item.version)).rejects.toMatchObject({ status: 404 });
    const result = await listCollection(ids[0], { ...query, q: "100%_literal" });
    expect(result.items.map((row) => row.id)).toContain(item.id);
    expect(result.summary.invested).toBe("60.00");
    expect(result.summary.albums).toEqual([{ category: "manga", entries: 1, total: 2, owned: 2 }]);
  });
  it("exclui desejos e compras pendentes do valor do acervo", async () => {
    await saveCollection(ids[0], { ...book, title: "Volume faltante", status: "wishlist", purchasePrice: "500" });
    await saveCollection(ids[0], { ...book, title: "Volume a caminho", status: "ordered", purchasePrice: "200" });
    const result = await listCollection(ids[0], query);
    expect(result.summary).toMatchObject({ owned: 2, wishlist: 1, invested: "60.00" });
    expect((await listCollection(ids[0], { ...query, status: "wishlist" })).total).toBe(1);
    const filtered = await listCollection(ids[0], { ...query, minPrice: 31, maxPrice: 100 });
    expect(filtered.total).toBe(0);
    expect(filtered.summary.albums).toEqual([{ category: "manga", entries: 3, total: 6, owned: 2 }]);
    expect((await listCollection(ids[0], { ...query, minPrice: 29, maxPrice: 31 })).total).toBe(1);
  });
  it("persiste empréstimo e devolução e rejeita edição desatualizada", async () => {
    const loan = collectionInputSchema.parse({ ...book, title: "HQ emprestada", status: "loaned", borrower: "Ricardo", loanDueAt: "2026-10-20" });
    const item = await saveCollection(ids[0], loan);
    const returned = await saveCollection(ids[0], collectionInputSchema.parse({ ...loan, status: "owned" }), item.id, 1);
    expect(returned).toMatchObject({ status: "owned", borrower: "", loanDueAt: "", version: 2 });
    await expect(saveCollection(ids[0], loan, item.id, 1)).rejects.toMatchObject({ status: 409 });
    await expect(deleteWorkspaceItem("collections", ids[0], item.id, 1)).rejects.toMatchObject({ status: 409 });
    await deleteWorkspaceItem("collections", ids[0], item.id, 2);
  });
  it("persiste orçamento, calcula saldo e protege pedidos entre organizações", async () => {
    const item = await saveCommission(ids[0], order);
    expect((await listCommissions(ids[1], query)).total).toBe(0);
    await expect(saveCommission(ids[1], order, item.id, 1)).rejects.toMatchObject({ status: 404 });
    await expect(deleteWorkspaceItem("commissions", ids[1], item.id, 1)).rejects.toMatchObject({ status: 404 });
    const result = await listCommissions(ids[0], query);
    expect(result.summary.stages).toEqual([{ status: "approved", total: 1 }]);
    expect((await listCommissions(ids[0], { ...query, status: "quote" })).summary.stages).toEqual([{ status: "approved", total: 1 }]);
    expect(result.items[0].estimate).toMatchObject({ totalCost: "150.00", suggestedPrice: "200.00", remaining: "150.00" });
    expect(result.summary.receivable).toBe("150.00");
    await saveCommission(ids[0], { ...order, status: "delivered", paidAmount: "200" }, item.id, 1);
    expect((await listCommissions(ids[0], query)).summary.stages).toEqual([{ status: "delivered", total: 1 }]);
    expect((await listCommissions(ids[0], query)).summary.receivable).toBe("0.00");
    await expect(saveCommission(ids[0], order, item.id, 1)).rejects.toMatchObject({ status: 409 });
    await deleteWorkspaceItem("commissions", ids[0], item.id, 2);
  });
  it("exclui orçamentos e cancelados do saldo confirmado", async () => {
    await saveCommission(ids[0], { ...order, status: "quote" });
    await saveCommission(ids[0], { ...order, status: "canceled" });
    expect((await listCommissions(ids[0], query)).summary.receivable).toBe("0");
  });
});
