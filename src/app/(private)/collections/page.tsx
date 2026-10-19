import { CollectionsWorkspace } from "@/components/geek-workspace/collections";
import { getPrivatePageContext } from "@/server/page-context";
import { listCollection } from "@/server/geek-workspace/service";
export const metadata = { title: "Coleções geek — GeekPrice" };
export default async function CollectionsPage() {
  const actor = await getPrivatePageContext();
  const initial = await listCollection(actor.organizationId, { q: "", category: "", status: "", page: 1 });
  return <CollectionsWorkspace initial={initial} canManage={actor.role !== "member" && (actor.access === "active" || actor.access === "grace")}/>;
}
