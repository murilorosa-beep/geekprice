import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, Layers, Lock, Sparkles } from "lucide-react";
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

        {/* Roadmap / Teaser Card */}
        <article className="panel software-card software-card-upcoming">
          <div className="software-card-header">
            <div className="software-icon upcoming">
              <Layers size={24} />
            </div>
            <div>
              <span className="status-pill status-neutral">Em breve na vitrine</span>
              <h2>Novos Softwares no Roadmap</h2>
            </div>
          </div>
          <p className="software-description">
            Estamos desenvolvendo novos módulos integrados para o seu negócio: Frente de Caixa (GeekPDV),
            Business Intelligence avançado (GeekAnalytics) e Integrações multicanal com marketplaces.
          </p>
          <ul className="software-feature-list">
            <li>
              <Clock size={16} />
              <span>GeekPDV — Ponto de venda ágil para balcão</span>
            </li>
            <li>
              <Clock size={16} />
              <span>GeekAnalytics — Métricas preditivas de giro</span>
            </li>
          </ul>
          <div className="software-card-footer">
            <Link href="/" className="secondary full">
              Ver Vitrine Pública e Planos
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
