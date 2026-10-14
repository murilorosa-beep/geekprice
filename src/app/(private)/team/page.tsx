import { TeamManager } from "@/components/team-manager";
import { getPrivatePageContext } from "@/server/page-context";

export default async function TeamPage() {
  const actor = await getPrivatePageContext();
  if (actor.role === "member") return <div className="page-content"><h1>Equipe</h1><p>Você não tem permissão para gerenciar a equipe.</p></div>;
  return <TeamManager role={actor.role}/>;
}
