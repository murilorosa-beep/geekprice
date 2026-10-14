# GeekPrice — situação do projeto

## Estado atual — Fase 9.3 (14/10/2026) — Marco 1 Concluído

O estado técnico vigente e comprovado está documentado em [PHASE9_3_FUNCTIONAL_MVP_REPORT.md](PHASE9_3_FUNCTIONAL_MVP_REPORT.md). A Fase 9.3 consolidou o GeekPrice como um programa SaaS utilizável e funcional (Marco 1):
- **Validação Completa no Navegador:** Jornada real de 20 passos executada com Playwright Chromium em ambiente de produção Next.js conectado ao PostgreSQL 17.11 isolado (`geekprice_phase81_test_1791978720676`). Todos os 20 passos aprovados com 0 erros de página.
- **Ciclo Funcional Completo Comprovado:** Login seguro, dashboard dinâmico, cadastro manual, cadastro inteligente Pokémon (TCGdex) e Magic (Scryfall), edição de custos/preços/quantidades, importação CSV de estoque com prévia assinada e commit atômico, exportação CSV, configuração de taxas e margens, importação de cotações BRL de mercado privadas, cálculo de piso rentável com proteção matemática contra prejuízo, aprovação manual de recomendação no Autopilot com geração de lote e auditoria, e rollback supervisionado com restauração contábil exata do preço original.
- **Desacoplamento e Segurança de Dependências:** O sistema base opera com independência de Mercado Pago, assinaturas pagas, WooCommerce, Mercado Livre, worker automático ou sincronização externa. Nenhuma conexão pendente é apresentada como ativa; o checkout permanece desabilitado preventivamente com mensagem clara na tela.
- **Suíte de Testes e Qualidade:** 83 testes unitários aprovados (24 arquivos), 31 testes de integração PostgreSQL real aprovados (22 Fase 8.1 + 9 Fase 9), 7 fluxos HTTP aprovados, 20/20 passos de navegador aprovados, typecheck TypeScript sem erros, ESLint sem erros e build Next.js com 69 rotas compiladas com sucesso.
- **Situação da Migration 0013 e Banco Comercial:** O banco comercial `postgres` no Supabase permanece estritamente preservado na versão `0012` (migration `0013` `recorded: false`). Todas as gravações e testes foram realizados exclusivamente no banco isolado de testes.
- **Conclusão:** Marco 1 concluído com sucesso. Sistema apto para pilotos comerciais assistidos (Marco 2).

## Estado anterior — Fase 9.2 (14/10/2026)

O estado técnico vigente e comprovado está documentado em [PHASE9_2_DISTRIBUTED_INTEGRITY_REPORT.md](PHASE9_2_DISTRIBUTED_INTEGRITY_REPORT.md). A Fase 9.2 consolidou a integridade distribuída e transacional do sistema:
- **Migration 0013 (`0013_distributed_integrity.sql`):** Criou `autopilot_worker_state` (singleton com lease, heartbeat e fencing version), `commerce_previews` (snapshot JSONB durável, payload hash canônico e status restrito) e `price_change_batches.idempotency_key` (índice único composto por organização). Aplicada **exclusivamente** no banco isolado de testes (`geekprice_phase81_test_1791978720676`). Banco comercial `postgres` intocado na versão `0012`.
- **Defesa SSRF (`src/server/commerce/safe-request.ts`):** Validação de URLs HTTPS, DNS IPv4 público, pinning de IP em TLS e bloqueio de faixas privadas/link-local/multicast.
- **Preview & Commit Transacional:** Snapshot de catálogo persistido com hash canônico estável; `SELECT ... FOR UPDATE` no consumo de preview; concorrência de commits resulta em 1 vencedor e 1 rejeição segura; detecção automática de alterações em catálogo remoto ou estoque local.
- **Worker com Lease e Fencing:** Aquisição de lease atômica; tokens de fencing impedem workers defasados ou desconectados de gravar progresso; retomada após crash em processo separado comprovada sem duplicar lotes ou históricos financeiros.
- **Testes & Qualidade:** 83 testes unitários aprovados (24 arquivos), 31 testes de integração com PostgreSQL real isolado (Supabase 17.11) aprovados com 100% de sucesso, typecheck e lint sem erros, build Next.js com 69 rotas compiladas com sucesso.
- **Alinhamento ao Marco 1:** Sistema base funcional sem dependência de cobranças, cron produtivo ou integrações externas obrigatórias.

## Estado anterior — Fase 9 (14/10/2026)

O estado técnico da Fase 9 está documentado em [PHASE9_PILOT_READINESS_REPORT.md](PHASE9_PILOT_READINESS_REPORT.md). A Fase 9 preparou o GeekPrice para pilotos comerciais assistidos (read-only):
- **Staging & Segurança:** Guardas ativas em runtime (`src/server/environment.ts`) bloqueando testes destrutivos no banco comercial; arquitetura em `docs/STAGING_ENVIRONMENT.md`.
- **Worker Autopilot Escalável:** Paginação em chunks, limites por organização/ciclo, orçamento de tempo (`maxExecutionTimeMs`), checkpoints persistentes com retomada e métricas de memória Node.js.
- **Primeira Integração Real (WooCommerce):** Conector REST v3 com HTTPS obrigatório, credenciais cifradas em repouso com AES-256-GCM, parser inteligente de metadados TCG.
- **Motor de Conciliação Inteligente:** Classificação estrita em 5 estados com preview assinado via HMAC-SHA256 (15 min) e commit transacional.
- **Fontes de Mercado BRL:** Estratégia oficial documentada em `docs/BRAZILIAN_MARKET_INTELLIGENCE.md` (Mercado Livre API, feeds parceiros, MSRP oficial, quarentena estatística).
- **Playbook do Piloto Comercial:** Guia completo de 4 semanas para 3–5 lojistas em `docs/PILOT_PROGRAM_PLAYBOOK.md`.

## Estado anterior — Fase 8.2 (14/10/2026)

O estado técnico da Fase 8.2 está em [PHASE8_2_FINAL_VALIDATION.md](PHASE8_2_FINAL_VALIDATION.md). O Supabase PostgreSQL 17.11 tem migrations `0000`–`0012` aplicadas; os fluxos de isolamento, importação BRL, recomendações, Autopilot supervisionado e rollback foram verificados em banco isolado, HTTP e navegador. O gráfico histórico usa dados PostgreSQL reais ou estado vazio. Git local foi inicializado sem publicação.

## Histórico das fases anteriores

Auditoria e Estabilização realizadas em 13/10/2026 (Fase 8). Uma tela existente não foi considerada evidência suficiente de conclusão; todas as constatações são baseadas em código, banco de dados, migrations e testes automatizados.

## Atualização da Fase 8 — Estabilização, Correções Críticas e BRL

A Fase 8 focou na estabilização de falhas de segurança e integridade identificadas na auditoria técnica (MVP Técnico Parcial 5,9/10), elevando a prontidão do sistema para **7,6/10**:

1. **Isolamento de SKU Multi-Tenant (Bloco A):**
   - Removida unicidade global em `product_variants.sku` via migration aditiva `0011_sku_isolation_and_brl_market.sql`.
   - Garantido isolamento estrito por organização (`inventory_org_sku_uidx` em `(organization_id, organization_sku)`).
   - Scoping de variantes não catalogadas geradas via criação manual ou lote CSV (`org:${organizationId}:${sku}`), eliminando sequestro ou colisão de variantes entre lojas distintas.

2. **Hardening de Segurança e Rate Limiting (Bloco A):**
   - Defesa em duas camadas contra spoofing de `X-Forwarded-For` e brute-force distribuído.
   - Camada 1: Limite por IP sanitizado (máx. 5 tentativas falhas em 15 minutos).
   - Camada 2: Bloqueio no nível da conta (`ACCOUNT_LOCKOUT_LIMIT = 10` falhas acumuladas em 15 minutos em qualquer IP).
   - Sanitização de cabeçalhos contra injeções e normalização determinística de e-mails (`email.toLowerCase().trim()`).

3. **Reconciliação do Drizzle Migration Journal (Bloco A):**
   - Registradas as migrations `0010_perf_indexes.sql` e `0011_sku_isolation_and_brl_market.sql` em `drizzle/meta/_journal.json`.

4. **Inteligência de Mercado em BRL (Bloco B):**
   - Módulo de importação de referências parceiras/nacionais (`src/server/market/partner-csv.ts` e `partner-import.ts`).
   - Validação Zod estrita para BRL: layout padrão com produto, coleção, número, condição, acabamento, fonte, moeda estritamente BRL, valor positivo, data recente (máx. 30 dias) e hash SHA-256 para idempotência.
   - Endpoints administrativos `/api/market/partner-import/preview` e `/api/market/partner-import/commit`.
   - Vínculo automático a `external_listings` e `price_observations` em BRL/BR, alimentando `listInventory`, `listAllInventory` e Autopilot com cotações reais.

5. **Gráfico Histórico Real e Tratamento Honesto de Dados (Bloco C):**
   - Substituição do SVG decorativo estático no Dashboard por visualização conectada a dados reais (`src/server/market/history.ts` e `/api/market/history`).
   - Suporte a filtros de 7, 30 e 90 dias com cálculo dinâmico de curvas e estatísticas reais (mínima, máxima, variação percentual).
   - Tratamento honesto de dados ausentes com empty state elegante quando há menos de 2 observações temporais, sem fabricar curvas ou dados falsos.

## Atualização da Fase 7

O código agora inclui cadastro público bloqueado por padrão, verificação de e-mail e recuperação de senha via Resend, onboarding, convites/papéis, consumo/limites e catálogo de planos. O checkout recorrente Mercado Pago e webhook assinado/idempotente estão preparados, mas nenhum plano tem preço por padrão e as credenciais ainda precisam ser configuradas e homologadas. `/platform/plans` exige `BILLING_ADMIN_EMAILS`. `/terms` e `/privacy` são modelos incompletos; o cadastro e os convites permanecem bloqueados até configuração de versões aprovadas. A migration `0008_commercial_platform.sql` foi aplicada ao PostgreSQL local em 13/10/2026. Consulte a seção “Produto comercial (Fase 7)” do README.

## Atualização da Fase 6

A base comercial multijogo está disponível em `/catalog`: Pokémon usa TCGdex e Magic usa Scryfall, ambos com seleção da impressão e cadastro inteligente no estoque. A página `/integrations` expõe o estado real dos provedores. Lorcana, One Piece, Gundam e Riftbound possuem conector Scrydex preparado, mas permanecem indisponíveis até a configuração de uma assinatura válida. Cobrança, contratos de dados e operação produtiva continuam como requisitos antes da venda pública. Consulte `PHASE6_STATUS.md`.

## Atualização da Fase 5

O Cadastro Inteligente Pokémon está funcional na tela de Produtos, com metadados TCGdex, identificador canônico, SKU privado por organização e proteção contra sobrescrita. ISBN/Google Books está preparado mas desativado sem chave/aprovação. O banco possui estrutura incremental somente leitura para futuros conectores ERP/e-commerce. Consulte `PHASE5_STATUS.md` e `ECOMMERCE_RESEARCH.md`.

## Atualização da Fase 4

A integração TCGdex está ativa para catálogo Pokémon e referências internacionais USD/EUR. A página Mercado, persistência histórica, vínculo explícito, deduplicação e alertas de variação foram implementados. A migration aditiva `0003_marvelous_celestials.sql` foi aplicada. Consulte `PHASE4_STATUS.md` e `API_RESEARCH.md` para o relatório completo, custos, limites e pendências.

## Resumo executivo

O GeekPrice é uma aplicação Next.js 16.4/React/TypeScript estrito, com PostgreSQL 17, Drizzle ORM e Auth.js (NextAuth v4). A base de autenticação, inventário, importação CSV e cálculo de preços é funcional. O dashboard consulta o PostgreSQL, mas parte da navegação e o gráfico histórico ainda são demonstrativos. O banco local está migrado até `0008_commercial_platform.sql`.

## Funcionalidades

| Área | Estado | Evidência e limite atual |
|---|---|---|
| Login por e-mail e senha | **Concluída** | Credentials Provider consulta `users`/`memberships`, valida Argon2id e cria sessão assinada. Fluxo HTTP real validado. |
| Hash de senha | **Concluída** | Bootstrap usa Argon2id. Hashes bcrypt antigos continuam válidos e são migrados no primeiro login correto. |
| Sessão e logout | **Concluída** | JWT assinado com duração de 8 horas; persistência entre requisições e invalidação no logout verificadas. |
| Proteção de acesso | **Concluída** | Página inicial redireciona visitantes ao login; APIs privadas usam `requireOrganization()` e revalidam o membership no banco. |
| Proteção contra tentativas excessivas | **Concluída** | Cinco falhas por e-mail/origem em 15 minutos causam bloqueio de 15 minutos, persistido em `login_attempts`. |
| Bootstrap do administrador | **Concluída** | Seed idempotente, sem senha padrão, exige senha de 12+ caracteres e cria `GeekPrice Admin`, owner, política e assinatura. |
| Isolamento multiempresa | **Concluída** | Organização vem da sessão e é revalidada; queries/mutações privadas filtram por `organization_id`; testes unitários cobrem autorização. |
| Schema e migrations | **Concluído localmente** | A migration comercial `0008_commercial_platform.sql` foi aplicada com tabelas, FKs e índices. |
| Listagem e pesquisa de estoque | **Concluída** | Consulta real com busca, categoria e paginação na API; dashboard inicial carrega até 50 itens. |
| CRUD de estoque | **Concluída** | API e interface oferecem cadastro, detalhes, edição dos dados privados, exclusão confirmada, busca, filtros e paginação. |
| Importação CSV | **Concluída** | Prévia, validação, limite de arquivo/linhas/plano, detecção de duplicidade e persistência existem. Processamento ainda é síncrono. |
| Exportação CSV | **Concluída** | Exporta os produtos atualmente carregados/filtrados no dashboard. |
| Motor de precificação | **Concluída** | Cálculo decimal usa política persistida, taxas, custos adicionais, margens e desconto de mercado, sempre respeitando o mínimo rentável. |
| Comparação de preços | **Parcial** | A tabela usa média de observações reais. Não existem conectores/coleta externa e o gráfico histórico é explicitamente marcado como demonstrativo. |
| Dashboard e indicadores | **Parcial** | Produtos, estoque, mínimo, ajustes, margem média e ausência de mercado são reais. O gráfico histórico continua demonstrativo e identificado. |
| Alertas | **Parcial** | Tabela e leitura dos cinco alertas recentes existem. Não há geração automática, tela completa, marcar como lido ou filtros. |
| Produtos/Mercado/Recomendações na navegação | **Concluída** | Rotas reais, navegação consistente e estados vazios; Mercado não inventa dados quando não há fontes. |
| Configurações da organização | **Concluída** | Nome, nome comercial, BRL e política de preços persistidos com autorização administrativa. |
| Recomendações persistidas | **Concluída** | Versões são criadas somente quando o hash dos parâmetros muda; filtros, prioridade e justificativa estão disponíveis. |
| Fontes externas | **Não implementada** | Schema existe, mas não há conectores, coleta ou agendamento. |
| Cobrança | **Parcial** | Catálogo de planos, checkout e webhook Mercado Pago implementados no código; faltam credenciais, preços e homologação no sandbox. |
| Cadastro comercial | **Parcial** | Cadastro, verificação, recuperação, onboarding e equipe implementados; Resend e versões legais aprovadas são pré-requisitos para habilitar. |

## Problemas encontrados e correções desta execução

- O README afirmava autenticação funcional, mas a senha ainda usava bcrypt e não havia rate limiting. Corrigido com Argon2id, migração transparente e bloqueio persistente.
- O bootstrap criava “Nexus Geek”, contrariando o requisito. Novas instalações criam “GeekPrice Admin”. Seeds existentes permanecem intactos.
- O gráfico apresentava curvas fixas como se fossem dados reais. Agora está identificado como demonstrativo e o seletor fictício foi desabilitado.
- O contador de alertas era fixo em 3. Agora reflete a consulta real.
- O botão de exportação apenas mostrava um toast. Agora gera CSV de verdade.
- A configuração Vitest em TypeScript emite um aviso sobre o futuro carregador nativo do Vite; não quebra os testes.
- `npm audit` reporta 9 vulnerabilidades sem correção automática disponível (4 moderadas e 5 altas), todas na cadeia de ferramentas de desenvolvimento (`drizzle-kit`, `eslint-config-next` e transitivas). Devem ser reavaliadas quando os pacotes publicarem versões corrigidas.

## Banco de dados

- PostgreSQL 17 em Docker Compose, volume nomeado `geekprice_pgdata` (não reinicializado).
- Migrations: `0000_misty_overlord.sql` (schema original), `0001_rich_mastermind.sql` (tentativas de login) e `0002_calm_doctor_octopus.sql` (organização, política e versionamento das recomendações).
- Dados persistidos: organizações, usuários, memberships, catálogo/variantes, estoque, fontes/listagens/observações, políticas, recomendações, alertas, importações, assinaturas e tentativas de login.
- Situação observada: 1 organização, 1 usuário, 0 itens de estoque e 0 importações. Nenhum dado existente foi apagado.

## Dados reais versus demonstração

- **PostgreSQL real:** identidade/organização, estoque, indicadores numéricos, tabela de produtos, preços médios quando há observações, alertas e importações.
- **Demonstrativo/fixo:** somente as linhas do gráfico histórico e a apresentação comercial do plano; o drawer usa a política real da organização.
- Com o banco atualmente vazio de estoque, métricas e tabela vazias são o resultado real esperado; use importação CSV para popular a organização.

## Validação executada

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm test`: 6 arquivos e 21 testes passaram.
- `npm run build`: passou com Next.js 16.4.0.
- `npm run test:auth`: passou contra o servidor e PostgreSQL reais, cobrindo autenticação, cadastro, edição, política, recomendação sem mercado, exclusão e logout; os dados de validação foram removidos e a política original restaurada.
- Migration aplicada com sucesso; container PostgreSQL saudável.
- Teste visual automatizado não pôde ser executado porque não havia navegador disponível no controlador desta sessão.

## Próximas etapas recomendadas

1. Implementar coleta autorizada de fontes externas e histórico real para o gráfico.
2. Adicionar gestão de usuários/memberships e seleção de organização para usuários multiempresa.
3. Ampliar testes de integração com duas organizações e concorrência no rate limiting.
4. Adicionar marcação como lido, filtros e geração automática de alertas.
5. Migrar importações grandes para job assíncrono quando o volume justificar.
6. Monitorar e atualizar dependências de desenvolvimento assim que houver correções para os avisos do `npm audit`.

## Execução local no Windows

Fluxo automático:

```powershell
.\scripts\start-geekprice.ps1
```

Ou use `iniciar-geekprice.cmd`. Na primeira execução, o script solicita e-mail/senha sem senha padrão, cria `.env`, inicia o banco, aplica migrations, executa o seed e abre o servidor em `http://localhost:3000`.

Fluxo manual:

```powershell
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Antes de `npm run db:seed`, configure `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` apenas no `.env`; a senha deve ter no mínimo 12 caracteres. Não publique esse arquivo.
