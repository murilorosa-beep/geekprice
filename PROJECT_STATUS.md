# GeekPrice — situação do projeto

## Estado atual — Fase 8.2 (14/10/2026)

O estado técnico vigente está em [PHASE8_2_FINAL_VALIDATION.md](PHASE8_2_FINAL_VALIDATION.md). O Supabase PostgreSQL 17.11 tem migrations `0000`–`0012` aplicadas; os fluxos de isolamento, importação BRL, recomendações, Autopilot supervisionado e rollback foram verificados em banco isolado, HTTP e navegador. O gráfico histórico usa dados PostgreSQL reais ou estado vazio. Git local foi inicializado sem publicação. O texto abaixo preserva o histórico das fases anteriores e não deve ser usado como diagnóstico atual do banco, testes ou dependências.

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
