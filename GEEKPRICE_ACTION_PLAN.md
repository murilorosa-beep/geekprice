# GeekPrice — plano de ação pós-auditoria

## Etapa 1 — Correções críticas

### SEC-01: restringir promoção de administrador à organização administrativa

- **Objetivo:** impedir que `create-master-admin.ts` eleve memberships de outras lojas.
- **Arquivos:** `scripts/create-master-admin.ts`, testes novos do script/serviço extraído.
- **Risco:** alto; hoje o script pode alterar privilégios indevidamente.
- **Pré-requisito:** staging isolado e uma conta de teste com duas memberships.
- **Implementação:** consultar e atualizar usando `userId` **e** `org.id`; recusar execução se o usuário possuir memberships externas, salvo escolha explícita e auditada.
- **Aceite:** executar contra a conta multiempresa de staging preserva a role da segunda organização; somente `GeekPrice Admin` fica `owner`.
- **Validação:** teste automatizado e revisão do SQL/logs, sem rodar o script no comercial.
- **Prioridade/dependência:** P1; independente.

### OPS-01: alinhar o artefato a implantar

- **Objetivo:** impedir que Railway implante uma versão anterior às correções.
- **Arquivos:** nenhum de código necessariamente; GitHub/Railway após aprovação humana.
- **Risco:** alto operacional.
- **Pré-requisito:** revisão dos três commits locais e política de release.
- **Aceite:** `origin/main` contém o SHA aprovado e Railway mostra exatamente esse SHA.
- **Validação:** `git rev-list --left-right --count origin/main...HEAD` retorna `0 0` depois da publicação; conferir SHA no log do deploy.
- **Prioridade/dependência:** P1; requer autorização humana para push/deploy.

### OPS-02: encerrar incerteza de credenciais

- **Objetivo:** assegurar que credenciais possivelmente expostas no passado não funcionam mais.
- **Arquivos:** runbook privado; não registrar segredo no Git.
- **Risco:** alto se houve vazamento confirmado.
- **Pré-requisito:** responsável por credenciais e janela operacional.
- **Aceite:** senha administrativa, `NEXTAUTH_SECRET`, URL/senha do banco e chaves de integração relevantes foram rotacionadas conforme aplicável; sessões antigas rejeitadas.
- **Validação:** registrar data, operador e hash/fingerprint não reversível; login novo e rejeição de sessão antiga em staging.
- **Prioridade/dependência:** P1; ação humana autorizada.

## Etapa 2 — Estabilização do MVP

### Homologar fluxo central no staging isolado

- **Objetivo:** repetir integração PostgreSQL e E2E com código atual.
- **Arquivos:** `tests/integration/*`, `scripts/verify-*-browser.mjs`, `docs/STAGING_ENVIRONMENT.md`.
- **Risco:** médio; testes são destrutivos no banco alvo.
- **Pré-requisito:** DATABASE_URL apontando para banco isolado, `PHASE81_TEST_DATABASE` com nome validado, sem permissões ao comercial.
- **Aceite:** `npm run test:integration`, typecheck, lint, unit e build passam; fluxo browser de login→produto→CSV→preço→aprovação→rollback passa.
- **Validação:** capturar resultados e destino do banco sem credenciais.
- **Prioridade/dependência:** P1; depende de staging.

### Reduzir privilégio do runtime e endurecer browser

- **Objetivo:** diminuir blast radius do backend e preparar CSP.
- **Arquivos:** configuração Supabase, `src/db/index.ts`, migrations/políticas futuras, `next.config.ts`.
- **Risco:** médio/alto; mudança errada pode indisponibilizar a aplicação.
- **Pré-requisito:** matriz de grants e regressão E2E.
- **Aceite:** runtime opera com o mínimo de grants definido; CSP não quebra Auth.js, imagens ou UI.
- **Validação:** testes de acesso negado e relatório de headers.
- **Prioridade/dependência:** P2; depois de staging.

### Definir beta sem expiração inesperada

- **Objetivo:** evitar que lojas piloto percam escrita após 14 dias.
- **Arquivos:** documentação operacional; possivelmente configuração/serviço de assinatura após decisão de produto.
- **Risco:** médio.
- **Pré-requisito:** decisão de quantos produtos/membros cada piloto recebe.
- **Aceite:** cada loja tem status/limites/data de revisão registrados e comunicados; Mercado Pago permanece desabilitado.
- **Validação:** simular data vencida em staging e confirmar comportamento read-only.
- **Prioridade/dependência:** P1; necessário antes de convite.

## Etapa 3 — Preparação do beta privado

### Checklist Railway e operação

- **Objetivo:** executar apenas o núcleo em ambiente reproduzível.
- **Arquivos:** `.env.example`, `DEPLOY_READINESS_GEEKPRICE.md`, configuração Railway.
- **Risco:** alto se segredos/URL/CA forem incorretos.
- **Pré-requisito:** SHA publicado, segredos em cofre, Supabase acessível.
- **Aceite:** `NODE_ENV`/`APP_ENV=production`; `DATABASE_URL` TLS; `NEXTAUTH_URL`/secret corretos; pool ajustado; `FEATURE_BRL_SCRAPING_ENABLED=false`; cron sem segredo/inativo; Mercado Pago ausente; integração ausente se não usada.
- **Validação:** health check dedicado a criar, teste de login e smoke test apenas em staging antes de produção.
- **Prioridade/dependência:** P1; depende de OPS-01.

### Acesso das lojas e conformidade

- **Objetivo:** convidar 3–5 lojas de modo controlado.
- **Arquivos:** termos/privacidade aprovados, configuração Resend, `docs/PILOT_PROGRAM_PLAYBOOK.md`.
- **Risco:** médio jurídico e operacional.
- **Pré-requisito:** domínio de e-mail configurado, documentos revisados, suporte definido.
- **Aceite:** convite, verificação, redefinição de senha e remoção de membro testados; versões legais persistidas; canal de suporte e backup definidos.
- **Validação:** contas de teste não comerciais e evidência de e-mail entregue.
- **Prioridade/dependência:** P1; depende de staging.

## Etapa 4 — Melhorias após feedback

### Medir antes de escalar

- **Objetivo:** resolver gargalos comprovados, não hipotéticos.
- **Arquivos:** queries de inventário/dashboard/histórico, importador CSV, observabilidade.
- **Risco:** médio.
- **Pré-requisito:** dados sintéticos isolados representando 1k/10k itens.
- **Aceite:** métricas de p50/p95, consultas lentas e consumo de pool; paginação/índices ajustados apenas onde necessário.
- **Validação:** benchmark versionado e comparação antes/depois.
- **Prioridade/dependência:** P2; feedback e staging.

### UX orientada ao lojista

- **Objetivo:** reduzir navegação e tornar preço/risco compreensíveis.
- **Arquivos:** componentes de dashboard/produto/recomendação/Autopilot.
- **Risco:** baixo/médio.
- **Pré-requisito:** 3–5 entrevistas de piloto.
- **Aceite:** fluxo de cadastro, cotação, aprovação e rollback compreendido sem ajuda técnica; estados vazios e erros avaliados em desktop/mobile.
- **Validação:** sessões observadas e testes Playwright acessíveis.
- **Prioridade/dependência:** P2.

## Etapa 5 — Evolução comercial

### Fontes BRL e automação

- **Objetivo:** obter referências comerciais legalmente utilizáveis antes de automação.
- **Arquivos:** `src/server/market/brazilian-*`, contratos/documentação de fonte.
- **Risco:** alto financeiro/jurídico.
- **Pré-requisito:** contrato/API autorizada, dados de vendas ou metodologia auditável, política de qualidade/outliers.
- **Aceite:** origem, tipo de preço, data, edição e licença rastreáveis; fonte não homologada nunca autoaplica.
- **Validação:** amostra manual confrontada com origem e testes contra edição/condição/foil.
- **Prioridade/dependência:** P2/P1 para autopilot automático; não habilitar scraping HTML sem autorização.

### Cobrança e integrações reais

- **Objetivo:** ativar somente após beta estável.
- **Arquivos:** Mercado Pago/WooCommerce, runbooks e testes sandbox.
- **Risco:** alto financeiro e de dados.
- **Pré-requisito:** homologação sandbox, suporte, monitoramento e rollback.
- **Aceite:** webhooks idempotentes verificados, checkout real sandbox, integração WooCommerce read-only com loja de teste e revogação de credenciais.
- **Validação:** cenários de falha, replay e cancelamento documentados.
- **Prioridade/dependência:** P2; após feedback do beta.
