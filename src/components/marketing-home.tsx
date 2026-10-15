"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight, CircleDollarSign, Flame, Layers, Menu, PackageSearch, Search, ShieldCheck, Sparkles, Users, Workflow, X, Zap } from "lucide-react";
import { GeekMark, TcgCardFan } from "./tcg-art";

export type MarketingSoftware = {
  id: string; code: string; name: string; tagline: string; description: string;
  marketingFeatures: string[];
  plans: Array<{ id: string; code: string; name: string; description: string; monthlyPrice: string | null; productLimit: number; memberLimit: number; trialDays: number; features: string[] }>;
};

const navigation = [["#geekprice", "O GeekPrice"], ["#plataforma", "Plataforma"], ["#como-funciona", "Como funciona"], ["#planos", "Planos"], ["#faq", "Dúvidas"]];
const questions = [
  ["Preciso cadastrar cada carta manualmente?", "Você pode buscar cartas nos catálogos integrados de Pokémon e Magic e conferir imagem, coleção e número antes de adicionar ao estoque. Para outros itens, o cadastro manual continua disponível."],
  ["Como funciona a sugestão de preço?", "O GeekPrice considera custo, taxas, custos adicionais e margem desejada. Quando existe uma referência de mercado compatível, ela também entra na análise. Você consegue revisar o cálculo e o motivo de cada sugestão."],
  ["As referências internacionais são preços brasileiros?", "Não. Os valores internacionais aparecem identificados em sua moeda. Referências em reais são apresentadas separadamente, com informações sobre a fonte, a variante e a data da observação."],
  ["Posso trazer meu estoque de uma planilha?", "Sim. A importação CSV permite conferir uma prévia, revisar inconsistências e confirmar os dados antes de gravar. Você também pode exportar os produtos para continuar trabalhando com seus arquivos."],
  ["Minha equipe pode usar a mesma loja?", "Sim. Você pode convidar pessoas e definir seus perfis de acesso. A quantidade de usuários depende do plano contratado, e cada organização tem seu próprio espaço de trabalho."],
  ["Como os softwares da plataforma são organizados?", "Uma mesma conta dá acesso à área Meus softwares. Nela, você acompanha os produtos disponíveis, os seus acessos e os planos da sua organização. O GeekPrice é o foco desta vitrine; novos produtos podem ser apresentados nesse mesmo espaço."],
];

export function MarketingHome({ products }: { products: MarketingSoftware[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<"dashboard" | "collection">("collection");
  const [softwareId, setSoftwareId] = useState(products.find((product) => product.code === "geekprice")?.id ?? products[0]?.id ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const software = products.find((product) => product.id === softwareId);
  const plans = software?.plans ?? [];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const targets = rootRef.current?.querySelectorAll<HTMLElement>(".mkt-reveal") ?? [];
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { (entry.target as HTMLElement).dataset.reveal = "visible"; observer.unobserve(entry.target); }
    }), { threshold: .08 });
    targets.forEach((target) => {
      if (target.getBoundingClientRect().top > window.innerHeight) { target.dataset.reveal = "waiting"; observer.observe(target); }
    });
    return () => observer.disconnect();
  }, []);

  return <div className="mkt-root" ref={rootRef}>
    <a className="mkt-skip" href="#conteudo">Ir para o conteúdo</a>
    <header className="mkt-header"><div className="mkt-container mkt-header-inner">
      <Link href="/" className="mkt-brand" aria-label="GeekPrice — início"><GeekMark/><span><strong>GeekPrice<span className="mkt-brand-dot">.</span></strong><small>SOFTWARE PARA O UNIVERSO GEEK</small></span></Link>
      <nav id="marketing-nav" className={`mkt-nav${menuOpen ? " is-open" : ""}`} aria-label="Navegação da página">{navigation.map(([href, label]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}<Link href="/register" className="mkt-mobile-signup">Criar minha conta <ArrowUpRight size={15}/></Link></nav>
      <div className="mkt-header-actions"><Link className="mkt-login" href="/login">Entrar <ArrowUpRight size={14}/></Link><Link className="mkt-button mkt-button-small" href="/register">Criar conta <ArrowRight size={15}/></Link><button type="button" className="mkt-menu-button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} aria-controls="marketing-nav" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={22}/> : <Menu size={22}/>}</button></div>
    </div></header>

    <main id="conteudo" className="mkt-main">
      <section className="mkt-hero mkt-container" aria-labelledby="marketing-title">
        <div className="mkt-hero-copy"><span className="mkt-eyebrow"><i/> GESTÃO, COM IDENTIDADE GEEK</span><h1 id="marketing-title">Sua loja geek.<br/>Uma gestão<br/><em>à altura.</em></h1><p>Você entende de cartas. A gente ajuda com o resto. Organize seu acervo, entenda seus preços e cuide da sua operação em um só lugar.</p><div className="mkt-hero-actions"><a className="mkt-button" href="#geekprice">Conhecer o GeekPrice <ArrowRight size={18}/></a><a className="mkt-text-link" href="#planos">Encontrar meu plano <ArrowUpRight size={17}/></a></div><div className="mkt-hero-notes"><span><CheckCheck size={15}/> Feito para lojas de cards</span><span><ShieldCheck size={15}/> Um espaço só da sua loja</span></div></div>
        <div className="mkt-scene" aria-label="Ilustração original de cartas colecionáveis e recursos da plataforma" role="img"><div className="mkt-scene-glow"/><div className="mkt-scene-ring"/><span className="mkt-scene-edition"><Sparkles size={13}/> A GESTÃO TAMBÉM EVOLUI</span><TcgCardFan/><div className="mkt-floating mkt-floating-stock"><span className="mkt-floating-icon"><Layers size={19}/></span><div><small>SUA COLEÇÃO, ORGANIZADA</small><strong>Cada carta no seu lugar.</strong></div><Check size={15}/></div><div className="mkt-floating mkt-floating-price"><div className="mkt-floating-label"><CircleDollarSign size={16}/> Preço com contexto</div><strong>Custo <span>+</span> taxas <span>+</span> margem</strong><small>Mais clareza para decidir.</small></div><span className="mkt-scene-coordinate">GEEKPRICE / COLLECTOR WORKSPACE</span></div>
        <a href="#geekprice" className="mkt-scroll-cue"><ArrowDown size={14}/> DESCUBRA UM NOVO JEITO DE GERIR</a>
      </section>

      <div className="mkt-worlds"><div className="mkt-container"><span>O seu universo.<br/><strong>A nossa inspiração.</strong></span><span><Zap/> Pokémon TCG</span><span><Flame/> Magic: The Gathering</span><span><Layers/> Cards & colecionáveis</span><i aria-hidden="true">✦</i></div></div>

      <section id="geekprice" className="mkt-section mkt-container mkt-reveal">
        <div className="mkt-section-heading mkt-heading-split"><div><span className="mkt-eyebrow">CONHEÇA O SEU NOVO WORKSPACE</span><h2>Cada carta no seu lugar.<br/><em>Sua coleção em outra perspectiva.</em></h2></div><p>O GeekPrice aproxima a gestão do universo de quem vende cards. Da edição certa ao preço de venda, os detalhes importantes ficam à vista.</p></div>
        <div className="mkt-product-window"><div className="mkt-window-toolbar"><span className="mkt-window-dots" aria-hidden="true"><i/><i/><i/></span><span className="mkt-window-name"><GeekMark/> GeekPrice <small>SEU WORKSPACE TCG</small></span><div className="mkt-preview-tabs" role="group" aria-label="Prévia da interface"><button type="button" aria-pressed={preview === "dashboard"} onClick={() => setPreview("dashboard")}><Workflow size={14}/> Visão geral</button><button type="button" aria-pressed={preview === "collection"} onClick={() => setPreview("collection")}><Layers size={14}/> Modo coleção</button></div></div><div className={`mkt-product-image mkt-product-image-${preview}`}><Image key={preview} src={preview === "collection" ? "/marketing/geekprice-collection.png" : "/marketing/geekprice-dashboard.png"} alt={preview === "collection" ? "Interface do GeekPrice com cartas em coleção, imagens, edição, preço e quantidade em estoque." : "Dashboard do GeekPrice com visão do estoque, indicadores e cartas em destaque."} width={1440} height={preview === "collection" ? 1000 : 1200} sizes="(max-width: 1240px) 100vw, 1180px"/><span className="mkt-window-reflection" aria-hidden="true"/></div><div className="mkt-window-caption"><span><i/> Interface do produto</span><span>Capturas com dados de demonstração. Valores ilustrativos.</span></div></div>
        <div className="mkt-product-capabilities"><span><Search size={16}/> Edição certa</span><span><PackageSearch size={16}/> Estoque à vista</span><span><CircleDollarSign size={16}/> Preços explicados</span><span><Users size={16}/> Sua equipe conectada</span></div>
      </section>

      <section className="mkt-section mkt-container mkt-reveal" id="recursos"><div className="mkt-section-heading"><span className="mkt-eyebrow">MENOS ATRITO. MAIS CONTROLE.</span><h2>Nos detalhes da gestão,<br/><em>está o próximo movimento.</em></h2></div>
        <div className="mkt-bento"><article className="mkt-feature mkt-feature-collection"><div className="mkt-feature-icon"><Layers size={22}/></div><span className="mkt-feature-index">01 / ORGANIZAR</span><h3>Uma coleção que você<br/>reconhece de primeira.</h3><p>Busque no catálogo, confira coleção e número e traga os dados da carta para o estoque. Alterne entre tabela e coleção para trabalhar do seu jeito.</p><div className="mkt-feature-tags"><span>Pokémon via TCGdex</span><span>Magic via Scryfall</span><span>Importação CSV</span></div><div className="mkt-mini-collection" aria-hidden="true"><div><Zap/><span>CATÁLOGO</span><i>◆ ◆ ◆</i></div><div><Flame/><span>COLEÇÃO</span><i>◆ ◆ ◆</i></div><div><Layers/><span>ESTOQUE</span><i>◆ ◆ ◆</i></div></div></article>
          <article className="mkt-feature mkt-feature-price"><div className="mkt-feature-icon"><CircleDollarSign size={22}/></div><span className="mkt-feature-index">02 / ENTENDER</span><h3>Preço bom começa<br/>com clareza.</h3><p>Custos, taxas e margem no mesmo cálculo. Referências identificadas por fonte e moeda para você entender o que está comparando.</p><div className="mkt-formula"><span>Custo</span><i>+</i><span>Taxas</span><i>+</i><span>Margem</span><ArrowRight size={16}/><strong>Decisão</strong></div></article>
          <article className="mkt-feature mkt-feature-control"><div className="mkt-feature-icon"><ShieldCheck size={22}/></div><span className="mkt-feature-index">03 / DECIDIR</span><h3>Você no controle<br/>do próximo passo.</h3><p>Revise sugestões no Autopilot, entenda o motivo de cada ajuste e acompanhe o histórico das alterações.</p><div className="mkt-review-flow"><span><Search size={14}/> Conferir</span><ChevronRight size={13}/><span><Check size={14}/> Aprovar</span><ChevronRight size={13}/><span><Workflow size={14}/> Acompanhar</span></div></article></div>
      </section>

      <section id="como-funciona" className="mkt-section mkt-process-section"><div className="mkt-container"><div className="mkt-section-heading mkt-heading-split"><div><span className="mkt-eyebrow">DO PRIMEIRO CADASTRO À ROTINA</span><h2>Comece simples.<br/><em>Ganhe visão.</em></h2></div><p>Uma sequência que faz sentido para a sua operação. Sem precisar organizar tudo de uma vez.</p></div><div className="mkt-steps">{[{icon: PackageSearch, title: "Traga o seu acervo", description: "Busque uma carta no catálogo, cadastre um produto ou importe uma planilha CSV."}, {icon: Search, title: "Confira os detalhes", description: "Revise edição, condição, acabamento, custo e quantidade. Sua precificação começa aqui."}, {icon: Workflow, title: "Encontre seu ritmo", description: "Consulte referências, analise sugestões e acompanhe o que muda no seu estoque."}].map(({icon: Icon,title,description},i) => <article key={title}><span className="mkt-step-number">0{i+1}</span><Icon size={24}/><h3>{title}</h3><p>{description}</p></article>)}</div></div></section>

      <section id="plataforma" className="mkt-section mkt-container mkt-reveal"><div className="mkt-platform"><div><span className="mkt-eyebrow">UMA PLATAFORMA. MAIS POSSIBILIDADES.</span><h2>Um lugar para os softwares<br/><em>que movem a sua loja.</em></h2><p>Seus acessos, sua organização e seus planos no mesmo ambiente. Hoje, conheça o GeekPrice. Amanhã, novos produtos podem ganhar espaço na mesma plataforma.</p><Link href="/platform" className="mkt-text-link">Conhecer a plataforma <ArrowUpRight size={16}/></Link></div><div className="mkt-platform-stack">{[{icon: Users,title:"Uma conta",text:"Um acesso para entrar no seu ambiente."},{icon: Layers,title:"Seus softwares",text:"Produtos e acessos organizados em um só painel."},{icon: ShieldCheck,title:"Sua organização",text:"Equipe, permissões e planos da sua loja."}].map(({icon:Icon,title,text})=><article key={title}><span><Icon size={20}/></span><div><h3>{title}</h3><p>{text}</p></div><ArrowUpRight size={15}/></article>)}</div></div>
        {products.filter((product) => product.code !== "geekprice").length > 0 && <div className="mkt-more-products">{products.filter((product) => product.code !== "geekprice").map((product) => <article key={product.id}><Sparkles size={22}/><h3>{product.name}</h3><p>{product.tagline || product.description}</p><Link href="/platform">Conhecer produto <ArrowUpRight size={15}/></Link></article>)}</div>}
      </section>

      <section id="planos" className="mkt-section mkt-container mkt-reveal"><div className="mkt-section-heading mkt-centered"><span className="mkt-eyebrow">ENCONTRE O SEU ESPAÇO</span><h2>Uma escolha que acompanha<br/><em>o momento da sua loja.</em></h2><p>Veja os planos disponíveis e compare os limites da sua operação.</p></div>{products.length > 1 && <div className="mkt-software-tabs" role="group" aria-label="Planos por software">{products.map((product) => <button key={product.id} type="button" aria-pressed={product.id === softwareId} onClick={() => setSoftwareId(product.id)}>{product.name}</button>)}</div>}
        {plans.length > 0 ? <div className="mkt-pricing-grid">{plans.map((plan,index) => {
          const featured = plans.length > 1 && index === 1;
          const price = plan.monthlyPrice === null ? null : Number(plan.monthlyPrice);
          return <article key={plan.id} className={`mkt-plan${featured ? " mkt-plan-featured" : ""}`}>{featured && <span className="mkt-plan-ribbon"><Sparkles size={13}/> ESPAÇO PARA CRESCER</span>}<span className="mkt-plan-code">{software?.name ?? "GeekPrice"}</span><h3>{plan.name}</h3><p>{plan.description || "Recursos e limites para organizar a sua operação."}</p><div className="mkt-plan-price"><strong>{price === null ? "A definir" : price === 0 ? "Grátis" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price)}</strong>{price !== null && price > 0 && <span>/ mês</span>}</div><div className="mkt-plan-limits"><span><Layers size={16}/><strong>{plan.productLimit.toLocaleString("pt-BR")}</strong> produtos no estoque</span><span><Users size={16}/><strong>{plan.memberLimit}</strong> {plan.memberLimit === 1 ? "pessoa na equipe" : "pessoas na equipe"}</span>{plan.trialDays > 0 && <span><Check size={16}/>{plan.trialDays} dias de teste no plano</span>}</div><ul>{(plan.features.length > 0 ? plan.features : software?.marketingFeatures ?? []).map((feature) => <li key={feature}><Check size={14}/>{feature}</li>)}</ul><Link className={`mkt-button${featured ? "" : " mkt-button-outline"}`} href="/register">Conhecer este plano <ArrowRight size={16}/></Link></article>;
        })}</div> : <div className="mkt-plans-empty"><Sparkles size={28}/><h3>Os próximos passos estão na plataforma.</h3><p>Acesse sua conta para conferir os planos e a disponibilidade dos produtos.</p><Link href="/login" className="mkt-button">Acessar a plataforma <ArrowRight size={16}/></Link></div>}
      </section>

      <section id="faq" className="mkt-section mkt-container mkt-reveal"><div className="mkt-faq-layout"><div className="mkt-section-heading"><span className="mkt-eyebrow">ANTES DO PRÓXIMO PASSO</span><h2>Boas perguntas.<br/><em>Respostas claras.</em></h2><p>Conheça os detalhes de quem vai cuidar da gestão com você.</p></div><div className="mkt-faq-list">{questions.map(([question,answer],index)=><details key={question} open={index === 0}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></div></section>

      <section className="mkt-container mkt-reveal"><div className="mkt-final-cta"><div><span className="mkt-eyebrow"><Sparkles size={13}/> SEU PRÓXIMO MOVIMENTO</span><h2>Mais espaço para<br/><em>o que você ama.</em></h2><p>Traga a sua loja para um software que entende o seu universo.</p><div><Link href="/register" className="mkt-button">Criar minha conta <ArrowRight size={17}/></Link><Link href="/login" className="mkt-text-link">Já tenho acesso <ArrowUpRight size={16}/></Link></div></div><div className="mkt-final-art" aria-hidden="true"><TcgCardFan/></div></div></section>
    </main>

    <footer className="mkt-footer mkt-container"><div className="mkt-footer-top"><div><Link href="/" className="mkt-brand"><GeekMark/><span><strong>GeekPrice<span className="mkt-brand-dot">.</span></strong><small>SOFTWARE PARA O UNIVERSO GEEK</small></span></Link><p>Tecnologia para organizar a operação.<br/>Identidade para fazer parte do seu universo.</p></div><div><strong>Explore</strong><a href="#geekprice">O GeekPrice</a><a href="#plataforma">A plataforma</a><a href="#planos">Planos</a><a href="#faq">Dúvidas frequentes</a></div><div><strong>Seu acesso</strong><Link href="/login">Entrar na plataforma</Link><Link href="/register">Criar uma conta</Link><Link href="/forgot-password">Recuperar senha</Link></div><div><strong>Informações</strong><Link href="/terms">Termos de uso</Link><Link href="/privacy">Política de privacidade</Link><span>Feito para lojas de cards<br/>e colecionáveis.</span></div></div><div className="mkt-footer-bottom"><span>© {new Date().getFullYear()} GeekPrice. Todos os direitos reservados.</span><span>FEITO COM ATENÇÃO A CADA CARTA. <Sparkles size={12}/></span></div></footer>
  </div>;
}
