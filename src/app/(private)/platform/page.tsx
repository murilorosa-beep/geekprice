import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Hammer, Lock, Sparkles } from "lucide-react";
import { getPrivatePageContext } from "@/server/page-context";
import { listOrganizationSoftware } from "@/server/platform/service";

export const metadata = {
  title: "Meus Softwares — Plataforma SaaS",
  description: "Gerencie os softwares contratados e disponíveis para sua organização.",
};

const accessLabels: Record<string, { label: string; tone: string }> = {
  active: { label: "Assinatura ativa", tone: "status-active" },
  grace: { label: "Período de tolerância", tone: "status-warning" },
  read_only: { label: "Somente leitura", tone: "status-past_due" },
  blocked: { label: "Bloqueado / Não contratado", tone: "status-canceled" },
};

export default async function PlatformOverviewPage() {
  const actor = await getPrivatePageContext(true);
  const softwares = await listOrganizationSoftware(actor.organizationId);

  return (
    <div className="page-content">
      <div className="page-title">
        <div>
          <p className="eyebrow">SUÍTE DE APLICAÇÕES</p>
          <h1>Meus Softwares</h1>
          <p>Acesse as ferramentas ativas da sua empresa ou contrate novos softwares para expandir sua operação.</p>
        </div>
      </div>

      <div className="platform-grid">
        {softwares.map((sw) => {
          const badge = accessLabels[sw.access] ?? accessLabels.blocked;
          const isAccessible = sw.access === "active" || sw.access === "grace" || sw.access === "read_only";

          return (
            <article className="panel software-card" key={sw.id}>
              <div className="software-card-header">
                <div className="software-icon">
                  <Sparkles size={24} />
                </div>
                <div>
                  <div className="software-badge-row">
                    <span className={`status-pill ${badge.tone}`}>{badge.label}</span>
                    {sw.planName && <span className="software-plan-tag">{sw.planName}</span>}
                  </div>
                  <h2>{sw.name}</h2>
                </div>
              </div>

              <p className="software-description">{sw.tagline || sw.description}</p>

              {sw.marketingFeatures && sw.marketingFeatures.length > 0 && (
                <ul className="software-feature-list">
                  {sw.marketingFeatures.map((feat, idx) => (
                    <li key={idx}>
                      <CheckCircle2 size={16} className="text-accent" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="software-card-footer">
                {isAccessible ? (
                  <Link href={sw.appPath || "/dashboard"} className="primary full">
                    <span>Acessar {sw.name}</span>
                    <ArrowRight size={16} />
                  </Link>
                ) : (
                  <Link href="/billing" className="secondary full">
                    <Lock size={16} />
                    <span>Contratar ou Reativar</span>
                  </Link>
                )}
              </div>
            </article>
          );
        })}

      </div>
      <section className="gw-platform-modules"><h2>Mais ferramentas no seu acesso</h2><p>Coleções e encomendas estão incluídas no acesso atual da organização, respeitando o estado da assinatura. Primeira versão para testar com seus próprios projetos.</p><div className="platform-grid">
        <article className="panel gw-platform-module"><BookOpen size={28}/><h3>Coleções geek</h3><p>Organize mangás, HQs, figures, jogos e cartas autorais. Acompanhe desejos, compras pendentes e empréstimos.</p><Link className="primary" href={actor.access === "blocked" ? "/billing" : "/collections"}>Abrir coleções <ArrowRight size={16}/></Link></article>
        <article className="panel gw-platform-module"><Hammer size={28}/><h3>Encomendas geek</h3><p>Monte orçamentos com materiais e mão de obra. Acompanhe clientes, produção, prazos e valores recebidos.</p><Link className="primary" href={actor.access === "blocked" ? "/billing" : "/commissions"}>Abrir encomendas <ArrowRight size={16}/></Link></article>
      </div></section>
    </div>
  );
}
