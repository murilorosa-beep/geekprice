import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { authOptions } from "@/server/auth/options";
import { getOrganizationSessionContext } from "@/server/auth/context";
import { listPublicSoftwareCatalog } from "@/server/platform/service";

export const metadata = {
  title: "GeekPrice — Inteligência de Preços e Gestão de Estoque para Lojas Geek",
  description:
    "Monitore referências de preços do Magic: The Gathering e Pokémon TCG, proteja suas margens de lucro com taxas embutidas e automatize seu estoque com o GeekPrice. Comece grátis por 14 dias.",
};

const money = (value: string | number | null) => {
  if (value === null || value === undefined || Number(value) <= 0) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
};

export default async function PublicMarketingPage() {
  const session = await getServerSession(authOptions);

  // Se o assinante já estiver autenticado, vai direto para o painel de controle
  if (session?.user?.id) {
    let target = "/dashboard";
    try {
      const ctx = await getOrganizationSessionContext();
      if (!ctx.onboardingCompleted) {
        target = "/onboarding";
      }
    } catch {
      target = ""; // Sessão expirada ou inválida; continua na vitrine
    }
    if (target) {
      redirect(target);
    }
  }

  const products = await listPublicSoftwareCatalog();
  const geekpriceProduct = products.find((p) => p.code === "geekprice") ?? products[0];
  const plans = geekpriceProduct?.plans ?? [];

  return (
    <div className="landing-root">
      {/* Top Header / Navigation Bar */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="landing-brand">
            <div className="brand-mark">G</div>
            <div className="brand-text">
              <strong>GeekPrice</strong>
              <small>Inteligência para Lojas Geek</small>
            </div>
          </Link>

          <nav className="landing-nav-links">
            <a href="#recursos">Recursos</a>
            <a href="#comparativo">Como Funciona</a>
            <a href="#planos">Planos & Preços</a>
            <a href="#diferenciais">Segurança & LGPD</a>
            <a href="#faq">Dúvidas Frequentes</a>
          </nav>

          <div className="landing-nav-auth">
            <div className="auth-buttons">
              {session?.user?.id ? (
                <Link href="/dashboard" className="primary small cta-button">
                  <span>Ir para o Dashboard</span>
                  <ArrowRight size={14} />
                </Link>
              ) : (
                <>
                  <Link href="/login" className="secondary small">
                    Já sou assinante · Entrar
                  </Link>
                  <Link href="/register" className="primary small cta-button">
                    <span>Criar Conta Grátis</span>
                    <ArrowRight size={14} />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="hero-glow-1" />
        <div className="hero-glow-2" />

        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={14} className="badge-icon" />
            <span>INTEGRAÇÃO OFICIAL COM SCRYFALL (MAGIC) E TCGDEX (POKÉMON)</span>
          </div>

          <h1 className="hero-title">
            Precifique seu estoque em segundos com inteligência de mercado real
          </h1>

          <p className="hero-subtitle">
            Elimine planilhas manuais. O <strong>GeekPrice</strong> monitora o mercado de cards em tempo real,
            calcula taxas de marketplace e custos extras automaticamente, e garante que você nunca venda abaixo da sua margem de lucro mínima sustentável.
          </p>

          <div className="hero-actions">
            <Link href="/register" className="hero-primary-btn">
              <span>Começar Teste Grátis de 14 Dias</span>
              <ArrowRight size={18} />
            </Link>
            <a href="#planos" className="hero-secondary-btn">
              <CreditCard size={18} />
              <span>Conhecer Planos & Valores</span>
            </a>
          </div>

          <div className="hero-trust-row">
            <div className="trust-item">
              <CheckCircle2 size={16} className="text-green" />
              <span>14 dias grátis sem cartão de crédito</span>
            </div>
            <div className="trust-item">
              <ShieldCheck size={16} className="text-violet" />
              <span>Dados da sua loja 100% isolados e seguros</span>
            </div>
            <div className="trust-item">
              <CreditCard size={16} className="text-amber" />
              <span>Cobrança transparente via Mercado Pago</span>
            </div>
            <div className="trust-item">
              <Zap size={16} className="text-green" />
              <span>Cancelamento simples com 1 clique</span>
            </div>
          </div>
        </div>

        {/* Hero Visual Card Preview */}
        <div className="hero-preview-wrapper">
          <div className="hero-preview-card">
            <div className="preview-topbar">
              <div className="dots">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <span className="preview-url">app.geekprice.com.br/dashboard</span>
              <span className="preview-status-pill">
                <i className="status-indicator live" /> Conectado ao Mercado Nacional
              </span>
            </div>

            <div className="preview-grid">
              <div className="preview-stat">
                <span className="stat-label">Catálogo Canônico</span>
                <strong className="stat-val">Magic & Pokémon TCG</strong>
                <span className="stat-desc">Scryfall + TCGdex integrados</span>
              </div>
              <div className="preview-stat">
                <span className="stat-label">Margem Protegida</span>
                <strong className="stat-val">25.0% Desejada</strong>
                <span className="stat-desc">Taxa de marketplace embutida</span>
              </div>
              <div className="preview-stat">
                <span className="stat-label">Piloto Automático</span>
                <strong className="stat-val">48 Recomendações</strong>
                <span className="stat-desc">Prontas para aplicar em lote</span>
              </div>
              <div className="preview-stat">
                <span className="stat-label">Estoque Monitorado</span>
                <strong className="stat-val">R$ 148.500</strong>
                <span className="stat-desc">Isolamento total por loja</span>
              </div>
            </div>

            <div className="hero-intelligence-panel">
              {/* Gráfico de Posicionamento e Margem */}
              <div className="hero-intel-card">
                <div className="intel-card-header">
                  <div className="intel-card-title">
                    <strong>Posicionamento Competitivo vs. Piso de Margem</strong>
                    <span>Oscilação das referências de mercado nas últimas 4 semanas</span>
                  </div>
                  <span className="intel-badge purple">
                    <TrendingUp size={12} style={{ display: "inline", marginRight: "4px" }} />
                    Tendência Alta
                  </span>
                </div>

                <div className="intel-chart-wrap">
                  <svg className="intel-chart-svg" viewBox="0 0 520 170" fill="none" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="heroProfitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#28c78c" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#28c78c" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="heroLineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#28c78c" />
                        <stop offset="100%" stopColor="#4ade80" />
                      </linearGradient>
                    </defs>

                    {/* Linhas de grade sutis */}
                    <line x1="0" y1="30" x2="520" y2="30" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                    <line x1="0" y1="75" x2="520" y2="75" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                    <line x1="0" y1="120" x2="520" y2="120" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />

                    {/* Piso de Segurança (Custo + Taxas) */}
                    <path
                      d="M 10 135 C 130 135, 260 135, 510 135"
                      stroke="#f87171"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />

                    {/* Área de Lucro GeekPrice */}
                    <path
                      d="M 10 95 C 110 85, 200 65, 290 50 C 370 38, 440 42, 510 32 L 510 135 L 10 135 Z"
                      fill="url(#heroProfitGrad)"
                    />

                    {/* Curva de Referência de Mercado (Média Geral) */}
                    <path
                      d="M 10 82 C 100 78, 190 70, 280 58 C 370 48, 440 50, 510 40"
                      stroke="#927bff"
                      strokeWidth="2"
                      strokeDasharray="5 5"
                    />

                    {/* Curva Recomendação GeekPrice (Otimizada) */}
                    <path
                      d="M 10 95 C 110 85, 200 65, 290 50 C 370 38, 440 42, 510 32"
                      stroke="url(#heroLineGrad)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />

                    {/* Ponto focal com halo na 4ª semana */}
                    <circle cx="510" cy="32" r="5" fill="#4ade80" />
                    <circle cx="510" cy="32" r="10" stroke="#4ade80" strokeWidth="2" opacity="0.4" />

                    {/* Rótulos dos eixos */}
                    <text x="15" y="160" fill="#717088" fontSize="10" fontFamily="sans-serif">Sem 1</text>
                    <text x="175" y="160" fill="#717088" fontSize="10" fontFamily="sans-serif">Sem 2</text>
                    <text x="340" y="160" fill="#717088" fontSize="10" fontFamily="sans-serif">Sem 3</text>
                    <text x="475" y="160" fill="#4ade80" fontSize="10" fontWeight="bold" fontFamily="sans-serif">Hoje</text>
                  </svg>
                </div>

                <div className="intel-chart-legend">
                  <div className="intel-chart-legend-item">
                    <span className="legend-dot green" />
                    <span>Preço Recomendado (Margem Blindada)</span>
                  </div>
                  <div className="intel-chart-legend-item">
                    <span className="legend-dot purple" />
                    <span>Média de Mercado</span>
                  </div>
                  <div className="intel-chart-legend-item">
                    <span className="legend-dot red" />
                    <span>Piso Mínimo de Custo</span>
                  </div>
                </div>
              </div>

              {/* Decomposição Matemática de Margem */}
              <div className="hero-intel-card">
                <div className="intel-card-header">
                  <div className="intel-card-title">
                    <strong>Decomposição de Preço & Taxas</strong>
                    <span>Cálculo automático garantindo lucro líquido real</span>
                  </div>
                  <span className="intel-badge green">
                    <ShieldCheck size={12} style={{ display: "inline", marginRight: "4px" }} />
                    Proteção Ativa
                  </span>
                </div>

                <div className="intel-formula-list">
                  <div className="intel-formula-row">
                    <span className="intel-formula-label">Referência de Mercado</span>
                    <span className="intel-formula-val">R$ 580,00</span>
                  </div>
                  <div className="intel-formula-row">
                    <span className="intel-formula-label">Custo Médio de Aquisição</span>
                    <span className="intel-formula-val" style={{ color: "#a1a1aa" }}>- R$ 310,00</span>
                  </div>
                  <div className="intel-formula-row">
                    <span className="intel-formula-label">Comissão Marketplace (ex: 12%)</span>
                    <span className="intel-formula-val" style={{ color: "#f87171" }}>- R$ 68,00</span>
                  </div>
                  <div className="intel-formula-row">
                    <span className="intel-formula-label">Custos Operacionais & Envio</span>
                    <span className="intel-formula-val" style={{ color: "#f87171" }}>- R$ 12,00</span>
                  </div>
                  <div className="intel-formula-row result">
                    <span className="intel-formula-label" style={{ color: "#fff", fontWeight: 700 }}>
                      <Sparkles size={14} style={{ color: "#4ade80" }} />
                      Margem Líquida Real
                    </span>
                    <span className="intel-formula-val profit">
                      +30.1% (R$ 170,00/un)
                    </span>
                  </div>
                </div>

                <div className="intel-formula-footer">
                  <ShieldCheck size={16} style={{ flexShrink: 0 }} />
                  <span>Você nunca vende abaixo da margem mínima configurada pela sua loja.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* O Jeito Antigo vs. O Jeito GeekPrice */}
      <section className="landing-section" id="comparativo">
        <div className="section-header">
          <p className="eyebrow">A DIFERENÇA NA PRÁTICA</p>
          <h2>Por que lojas especializadas trocam planilhas pelo GeekPrice?</h2>
          <p>Veja como o GeekPrice transforma horas de trabalho braçal em automação inteligente e segura.</p>
        </div>

        <div className="comparison-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px", maxWidth: "1000px", margin: "0 auto" }}>
          {/* Card Antes */}
          <div className="diff-card" style={{ borderColor: "rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", color: "#f87171" }}>
              <XCircle size={22} />
              <h3 style={{ margin: 0, fontSize: "18px", color: "#fca5a5" }}>Sem o GeekPrice</h3>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px", fontSize: "14px", color: "#a1a1aa" }}>
              <li style={{ display: "flex", gap: "10px" }}>❌ <strong>Horas perdidas:</strong> Checar preços carta por carta em sites de terceiros toda semana.</li>
              <li style={{ display: "flex", gap: "10px" }}>❌ <strong>Prejuízo silencioso:</strong> Esquecer de calcular a comissão do marketplace e vender no prejuízo.</li>
              <li style={{ display: "flex", gap: "10px" }}>❌ <strong>Planilhas desatualizadas:</strong> Erros de digitação, fórmulas quebradas e dados perdidos.</li>
              <li style={{ display: "flex", gap: "10px" }}>❌ <strong>Preços estagnados:</strong> Cartas valorizadas no exterior continuam com preço antigo na sua vitrine.</li>
            </ul>
          </div>

          {/* Card Depois */}
          <div className="diff-card" style={{ borderColor: "rgba(34, 197, 94, 0.4)", background: "rgba(34, 197, 94, 0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", color: "#4ade80" }}>
              <CheckCircle2 size={22} />
              <h3 style={{ margin: 0, fontSize: "18px", color: "#86efac" }}>Com o GeekPrice</h3>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px", fontSize: "14px", color: "#e4e4e7" }}>
              <li style={{ display: "flex", gap: "10px" }}>✅ <strong>Cadastro em 1 clique:</strong> Digite o nome ou código e traga dados, edição e foto oficiais.</li>
              <li style={{ display: "flex", gap: "10px" }}>✅ <strong>Margem líquida blindada:</strong> O sistema embute taxas e calcula seu preço mínimo ideal.</li>
              <li style={{ display: "flex", gap: "10px" }}>✅ <strong>Autopilot inteligente:</strong> Atualize centenas de preços em lote e reverta quando quiser.</li>
              <li style={{ display: "flex", gap: "10px" }}>✅ <strong>Preços sempre lucrativos:</strong> Aproveite oscilações e novidades sem medo de perder dinheiro.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Recursos Principais */}
      <section className="landing-section" id="recursos">
        <div className="section-header">
          <p className="eyebrow">RECURSOS PROJETADOS PARA LOJISTAS</p>
          <h2>Tudo o que sua loja precisa para lucrar mais</h2>
          <p>Construído especificamente para a dinâmica e os desafios de quem comercializa card games no Brasil.</p>
        </div>

        <div className="differentiators-grid">
          <div className="diff-card">
            <div className="diff-icon-box">
              <PackageSearch size={24} />
            </div>
            <h4>Catálogo Integrado de Cards</h4>
            <p>
              Conexão com os bancos canônicos do Magic: The Gathering (Scryfall) e Pokémon TCG (TCGdex).
              Identifique edições, números de colecionador e acabamentos sem cadastrar tudo na mão.
            </p>
          </div>

          <div className="diff-card">
            <div className="diff-icon-box">
              <TrendingUp size={24} />
            </div>
            <h4>Motor de Precificação Blindado</h4>
            <p>
              Defina sua comissão de marketplace (ex: 12%), custos operacionais extras e margem desejada.
              O GeekPrice calcula a recomendação matemática garantindo que você nunca venda abaixo do mínimo.
            </p>
          </div>

          <div className="diff-card">
            <div className="diff-icon-box">
              <Bot size={24} />
            </div>
            <h4>Autopilot com Auditoria e Reversão</h4>
            <p>
              Configure regras para reajuste em lote por coleção, categoria ou raridade.
              Aplique dezenas de alterações com um clique e, se necessário, reverta todo o lote instantaneamente.
            </p>
          </div>

          <div className="diff-card">
            <div className="diff-icon-box">
              <RefreshCw size={24} />
            </div>
            <h4>Importação e Exportação CSV Ágeis</h4>
            <p>
              Já tem estoque em planilhas? Faça upload do seu arquivo CSV com pré-visualização, validação de linhas e
              detecção de duplicidade antes de salvar.
            </p>
          </div>

          <div className="diff-card">
            <div className="diff-icon-box">
              <Users size={24} />
            </div>
            <h4>Equipe com Papéis e Permissões</h4>
            <p>
              Convide colaboradores com perfis de Administrador ou Membro.
              Permita que a equipe de balcão consulte o catálogo sem ter acesso às configurações financeiras confidenciais da loja.
            </p>
          </div>

          <div className="diff-card">
            <div className="diff-icon-box">
              <ShieldCheck size={24} />
            </div>
            <h4>Segurança e Isolamento por Loja (LGPD)</h4>
            <p>
              Seus custos de aquisição e quantidades em estoque são 100% isolados. Nenhuma outra loja ou concorrente
              tem acesso aos seus dados confidenciais.
            </p>
          </div>
        </div>
      </section>

      {/* Planos e Preços Transparentes */}
      <section className="landing-section pricing-bg" id="planos">
        <div className="section-header">
          <p className="eyebrow">TRANSPARÊNCIA TOTAL</p>
          <h2>Planos Simples e Sem Fidelidade</h2>
          <p>Comece pelo teste grátis de 14 dias sem informar cartão. Mude de plano ou cancele quando quiser.</p>
        </div>

        <div className="pricing-grid">
          {plans.map((plan, index) => {
            const isFeatured = plan.code === "pro" || (plans.length > 1 && index === 1);
            const formattedPrice = money(plan.monthlyPrice);

            return (
              <div className={`pricing-card ${isFeatured ? "featured" : ""}`} key={plan.id}>
                {isFeatured && <div className="popular-badge">Mais Escolhido por Lojas</div>}

                <div className="pricing-card-header">
                  <span className="plan-code-label">{plan.code.toUpperCase()}</span>
                  <h3>{plan.name}</h3>
                  <p className="plan-card-desc">{plan.description || "Ideal para impulsionar a rentabilidade da sua loja."}</p>
                </div>

                <div className="price-display">
                  {formattedPrice ? (
                    <>
                      <strong className="price-amount">{formattedPrice}</strong>
                      <span className="price-period">/mês recorrente</span>
                    </>
                  ) : (
                    <>
                      <strong className="price-amount">Teste Grátis</strong>
                      <span className="price-period">14 dias sem compromisso</span>
                    </>
                  )}
                </div>

                <div className="plan-limits-box">
                  <div className="limit-row">
                    <Database size={15} className="text-violet" />
                    <span>
                      Até <strong>{plan.productLimit.toLocaleString("pt-BR")}</strong> itens no estoque
                    </span>
                  </div>
                  <div className="limit-row">
                    <Users size={15} className="text-violet" />
                    <span>
                      Até <strong>{plan.memberLimit}</strong> {plan.memberLimit === 1 ? "usuário" : "usuários"} na equipe
                    </span>
                  </div>
                  <div className="limit-row">
                    <Clock size={15} className="text-green" />
                    <span>
                      <strong>{plan.trialDays} dias</strong> de teste gratuito
                    </span>
                  </div>
                </div>

                <div className="plan-features-divider">Recursos inclusos</div>

                <ul className="plan-features-list">
                  {(plan.features && plan.features.length > 0
                    ? plan.features
                    : [
                        "Catálogo Magic & Pokémon",
                        "Motor de precificação",
                        "Importação e exportação CSV",
                        "Alertas de variação",
                        "Suporte por e-mail",
                      ]
                  ).map((feat, fIdx) => (
                    <li key={fIdx}>
                      <CheckCircle2 size={16} className="text-green" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <div className="plan-cta-wrapper">
                  <Link
                    href="/register"
                    className={`cta-btn ${isFeatured ? "primary" : "secondary"} full`}
                  >
                    <span>Começar 14 Dias Grátis</span>
                    <ArrowRight size={16} />
                  </Link>
                  <span className="plan-sub-note">Sem necessidade de cartão de crédito no cadastro</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="landing-section" id="faq">
        <div className="section-header">
          <p className="eyebrow">DÚVIDAS FREQUENTES</p>
          <h2>Perguntas Comuns de Lojistas</h2>
          <p>Tudo o que você precisa saber antes de iniciar o seu teste gratuito.</p>
        </div>

        <div className="faq-grid">
          <div className="faq-item">
            <h4>Preciso informar cartão de crédito para testar?</h4>
            <p>
              Não! O teste de 14 dias começa no momento em que você cria sua conta. Você terá acesso total às funcionalidades
              do GeekPrice sem inserir qualquer meio de pagamento até decidir assinar.
            </p>
          </div>

          <div className="faq-item">
            <h4>Como o GeekPrice calcula o preço recomendado?</h4>
            <p>
              O cálculo considera: seu custo de aquisição + taxas da sua plataforma de vendas + custos extras + sua margem desejada.
              Ele cruza isso com a média das referências de mercado e garante que o preço final preserve seu lucro real.
            </p>
          </div>

          <div className="faq-item">
            <h4>Meus concorrentes podem ver o meu estoque ou meus custos?</h4>
            <p>
              De forma alguma! A arquitetura do GeekPrice é estritamente isolada por organização (multi-tenant). Seus custos,
              margens e estoque são acessíveis exclusivamente pelos usuários autorizados da sua loja.
            </p>
          </div>

          <div className="faq-item">
            <h4>Como é processado o pagamento após o teste?</h4>
            <p>
              Utilizamos o Mercado Pago como parceiro oficial de pagamentos no Brasil. Você pode pagar via PIX ou
              cartão de crédito de forma recorrente e 100% segura.
            </p>
          </div>

          <div className="faq-item">
            <h4>Posso cancelar minha assinatura a qualquer momento?</h4>
            <p>
              Sim! O cancelamento é realizado diretamente no painel de controle da sua loja em 1 clique, sem taxas de
              fidelidade, multas ou burocracia.
            </p>
          </div>

          <div className="faq-item">
            <h4>Quais card games são suportados atualmente?</h4>
            <p>
              O GeekPrice possui catálogo oficial integrado com Magic: The Gathering (via Scryfall) e Pokémon TCG
              (via TCGdex), incluindo coleções clássicas e lançamentos recentes em português e inglês.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="landing-cta-banner">
        <div className="cta-banner-card">
          <div className="cta-banner-content">
            <h2>Pronto para profissionalizar a precificação da sua loja?</h2>
            <p>Crie sua conta em menos de 2 minutos e experimente o GeekPrice gratuitamente por 14 dias.</p>
            <div className="cta-banner-actions">
              <Link href="/register" className="primary large-btn">
                <span>Criar Minha Conta Grátis</span>
                <ArrowRight size={18} />
              </Link>
              <Link href="/login" className="secondary large-btn">
                <span>Já possuo uma conta</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-col brand-col">
            <div className="landing-brand">
              <div className="brand-mark">G</div>
              <strong>GeekPrice</strong>
            </div>
            <p>Inteligência de preços, gestão de estoque e automação para lojistas de cards e colecionáveis no Brasil.</p>
            <span className="copyright-text">
              © {new Date().getFullYear()} GeekPrice. Todos os direitos reservados.
            </span>
          </div>

          <div className="footer-col">
            <h5>Navegação</h5>
            <a href="#recursos">Recursos do GeekPrice</a>
            <a href="#comparativo">Como Funciona</a>
            <a href="#planos">Planos & Preços</a>
            <a href="#faq">Dúvidas Frequentes</a>
          </div>

          <div className="footer-col">
            <h5>Segurança & Jurídico</h5>
            <Link href="/terms">Termos de Uso</Link>
            <Link href="/privacy">Política de Privacidade</Link>
            <span>Conformidade com a LGPD</span>
            <span>Criptografia SSL de 256 bits</span>
          </div>

          <div className="footer-col">
            <h5>Acesso à Loja</h5>
            <Link href="/login">Área do Assinante (Login)</Link>
            <Link href="/register">Cadastrar Nova Loja</Link>
            <Link href="/forgot-password">Recuperar Senha</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
