import { AutopilotView } from "@/components/autopilot-view";
import { getPrivatePageContext } from "@/server/page-context";
import {
  getAutopilotQueue,
  listPriceBatches,
  listPricingRules,
} from "@/server/autopilot/service";

export default async function RecommendationsPage() {
  const actor = await getPrivatePageContext();
  const [initialQueue, initialRules, initialBatches] = await Promise.all([
    getAutopilotQueue(actor.organizationId, "counter"),
    listPricingRules(actor.organizationId),
    listPriceBatches(actor.organizationId),
  ]);

  return (
    <AutopilotView
      initialQueue={initialQueue}
      initialRules={initialRules}
      initialBatches={initialBatches}
    />
  );
}
