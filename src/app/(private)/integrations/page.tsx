import { CheckCircle2, Clock3, Plug, Zap } from "lucide-react";
import { scrydexConfigured } from "@/server/market/scrydex";
import { requireOrganization } from "@/server/auth/context";
import { CommerceIntegrationManager } from "@/components/commerce-integration-manager";

const commerceProviders = [
  {
    name: "WooCommerce REST API v3",
    detail: "Conexão direta por Consumer Key/Secret · produtos, variantes e estoque em modo somente leitura",
    status: "Disponível para Conexão",
    enabled: true,
  },
  {
    name: "Bling API v3",
    detail: "OAuth 2.0 · produtos, estoque, custo e preço (aguardando credenciais de aplicativo parceiro)",
    status: "Aguardando aplicativo homologado",
    enabled: false,
  },
  {
    name: "Nuvemshop",
    detail: "OAuth 2.0 · produtos e variantes (aguardando aplicativo de parceiro registrado)",
    status: "Aguardando aplicativo homologado",
    enabled: false,
  },
];

export default async function IntegrationsPage() {
  const actor = await requireOrganization();

  const providers = [
    {
      name: "PkmnPrices",
      games: "Pokémon TCG físico",
      active: Boolean(process.env.PKMNPRICES_API_KEY),
      detail: "Busca por coleção e número; preços TCGplayer em USD por condição e acabamento",
    },
    {
      name: "TCGdex",
      games: "Pokémon",
      active: true,
      detail: "Catálogo multilíngue e referências internacionais",
    },
    {
      name: "Scryfall",
      games: "Magic: The Gathering",
      active: true,
      detail: "Catálogo por impressão e preços USD/EUR",
    },
    {
      name: "Scrydex",
      games: "Pokémon, Magic, Lorcana, One Piece, Gundam e Riftbound",
      active: scrydexConfigured(),
      detail: scrydexConfigured()
        ? "Chave e equipe configuradas"
        : "Exige plano, SCRYDEX_API_KEY e SCRYDEX_TEAM_ID",
    },
  ];

  return (
    <div className="page-content">
      <div className="page-title">
        <div>
          <p className="eyebrow">FONTES E AUTOMAÇÕES</p>
          <h1>Integrações</h1>
          <p>Status real das fontes e catálogo; nenhuma conexão pendente é apresentada como ativa.</p>
        </div>
      </div>

      <div className="integration-grid">
        {providers.map((p) => (
          <article className="panel integration-card" key={p.name}>
            <div className={p.active ? "integration-icon active" : "integration-icon"}>
              {p.active ? <CheckCircle2 /> : <Clock3 />}
            </div>
            <div>
              <h2>{p.name}</h2>
              <strong>{p.games}</strong>
              <p>{p.detail}</p>
              <span className={p.active ? "provider-status active" : "provider-status"}>
                {p.active ? "Ativa" : "Credenciais necessárias"}
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="page-title integration-title">
        <div>
          <h2>Catálogo de Plataformas de E-commerce & ERP</h2>
          <p>
            Conectores para importação de estoque sem cadastro manual. Chaves protegidas por criptografia AES-256-GCM.
          </p>
        </div>
      </div>

      <div className="integration-grid">
        {commerceProviders.map((p) => (
          <article className="panel integration-card" key={p.name}>
            <div className={p.enabled ? "integration-icon active" : "integration-icon"}>
              <Plug />
            </div>
            <div>
              <h2>{p.name}</h2>
              <p>{p.detail}</p>
              <span className={p.enabled ? "provider-status active" : "provider-status"}>
                {p.status}
              </span>
            </div>
          </article>
        ))}
      </div>

      {/* Gerenciador Interativo de Conexões e Conciliação */}
      <CommerceIntegrationManager canManage={actor.role !== "member"} />

      <section className="panel notice-card integration-next" style={{ marginTop: 24 }}>
        <Zap />
        <h2>Próximas ativações de piloto</h2>
        <p>
          O conector WooCommerce está disponível para importação e conciliação em modo somente leitura. Os aplicativos Bling v3 e Nuvemshop aguardam homologação no programa de parceiros.
        </p>
      </section>
    </div>
  );
}
