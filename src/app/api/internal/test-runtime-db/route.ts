import { sql } from "drizzle-orm";
import { db } from "@/db";

// Diagnóstico deliberadamente indisponível em produção. Ele existe para impedir que
// os E2E gravem no banco errado e só retorna metadados de destino, nunca credenciais.
export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.E2E_RUNTIME_DIAGNOSTIC !== "true") {
    return new Response(null, { status: 404 });
  }

  const expected = process.env.PHASE81_TEST_DATABASE;
  const configured = process.env.DATABASE_URL;
  if (!expected || !configured || !/^geekprice_phase81_test_\d+$/.test(expected)) {
    return Response.json({ isolated: false, reason: "isolated_test_environment_not_configured" }, { status: 409 });
  }

  const configuredUrl = new URL(configured);
  const [current] = await db.execute(sql<{ database: string }>`select current_database() as database`);
  const actualDatabase = current?.database;
  const isolated = actualDatabase === expected && configuredUrl.pathname === `/${expected}`;

  return Response.json({
    isolated,
    host: configuredUrl.hostname,
    port: configuredUrl.port || "5432",
    database: actualDatabase,
  }, { status: isolated ? 200 : 409 });
}
