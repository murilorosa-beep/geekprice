import { CommissionsWorkspace } from "@/components/geek-workspace/commissions";
import { getPrivatePageContext } from "@/server/page-context";
import { listCommissions } from "@/server/geek-workspace/service";
export const metadata = { title: "Encomendas geek — GeekPrice" };
export default async function CommissionsPage() {
  const actor = await getPrivatePageContext();
  const initial = await listCommissions(actor.organizationId, { q: "", category: "", status: "", page: 1 });
  return <CommissionsWorkspace initial={initial} canManage={actor.role !== "member" && (actor.access === "active" || actor.access === "grace")}/>;
}
