import { MarketExplorer } from "@/components/market-explorer";
import { requireOrganization } from "@/server/auth/context";

export default async function MarketPage() {
  const actor = await requireOrganization();
  return <MarketExplorer canManage={actor.role !== "member"} pkmnPricesAvailable={Boolean(process.env.PKMNPRICES_API_KEY)} />;
}
