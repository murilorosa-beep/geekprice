import { ProductManager } from "@/components/product-manager";
import { getPrivatePageContext } from "@/server/page-context";
import { listInventory } from "@/server/inventory/service";
export default async function ProductsPage(){const actor=await getPrivatePageContext();const initial=await listInventory(actor.organizationId,{q:"",category:undefined,availability:"all",page:1,pageSize:10});return <ProductManager initial={initial} canManage={(actor.role === "owner" || actor.role === "admin") && actor.access !== "read_only"}/>}
