import { MarketExplorer } from "@/components/market-explorer";
import { BrlMarketImport } from "@/components/brl-market-import";
import { requireOrganization } from "@/server/auth/context";

export default async function MarketPage() {
  const actor = await requireOrganization();
  return <>{actor.role !== "member" && <BrlMarketImport />}<MarketExplorer /></>;
}
