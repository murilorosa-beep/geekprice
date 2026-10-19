# GEEKPRICE — AUDITORIA DO ESTADO ATUAL E VERIFICAÇÃO REAL DA PRECIFICAÇÃO BRASILEIRA

**Data da Auditoria:** 16 de outubro de 2026  
**Auditor:** Engenharia de Software Sênior / Auditoria Independente SaaS  
**Repositório:** `c:\Users\murilo.rosa\Desktop\geek-price`  
**Branch / Commit `HEAD`:** `main` (`0ec262c` — `feat(marketing): launch premium TCG storefront for GeekPrice platform`)  
**Escopo:** Auditoria independente de ponta a ponta (código-fonte, três bancos PostgreSQL, APIs HTTP, motor financeiro, Autopilot e interface real em navegador Playwright Chromium headless) **sem alteração de código funcional**.

---

## A. RESUMO EXECUTIVO

> **VEREDITO PRINCIPAL:** **Hoje os preços brasileiros do GeekPrice Index estão em um fluxo híbrido incompleto e isolado — na prática, para o estoque principal, estão disponíveis apenas numa tela/modal de consulta separada dentro de `/market` e NÃO estão integrados ao estoque (`/products`), nem à linha principal de comparação do Mercado, nem ao motor de Recomendações (`recommendations`), nem à fila do Autopilot (`/recommendations`). Além disso, no ambiente comercial configurado em `.env` (Supabase `postgres`), o GeekPrice Index sequer existe (migrations `0015` e `0016` não aplicadas e 0 cartas carregadas).**

### Principais Constatações Comprovadas com Evidências Reais

1. **Dois subsistemas de preços BRL desconectados no código:**
   - **Subsistema Legado de Estoque/Autopilot (`src/server/inventory/service.ts`):** Alimenta `/products`, o modal de detalhes do produto, a linha principal de `"Minhas cartas e preços"` em `/market`, `/api/recommendations` e `/api/autopilot/queue`. Ele calcula `item.marketPrice` **exclusivamente** a partir de `external_listings` + `sources` (`verified = 'true'`) + `price_observations` (`currency = 'BRL'`, `region = 'BR'`, `type = 'reference'`, exigindo correspondência estrita de `condition` e `finish`). **Ele ignora 100% as tabelas `index_inventory_links`, `index_cards` e `index_observations`.**
   - **Subsistema GeekPrice Index (`src/server/geekprice-index/*`):** Armazena cotações nas tabelas próprias `index_cards`, `index_observations`, `index_sources` e `index_inventory_links`. Só é consultado na aba `"Index BRL"` de `/market` e dentro do modal isolado `"Index BRL · sugerir preço"` (`src/components/geekprice-index-stock.tsx`) aberto manualmente em `/market` → `"Minhas cartas e preços"`.
2. **Desconexão de Ambiente / Banco de Dados (Causa K e E):**
   - O arquivo `.env` da aplicação aponta para o banco comercial Supabase (`aws-0-us-east-1.pooler.supabase.com:5432/postgres`). Nesse banco, apenas as migrations `0000` a `0014` foram aplicadas; **as migrations `0015_yellow_zodiak.sql` e `0016_fancy_lockjaw.sql` NÃO estão aplicadas** e as tabelas `index_*` **não existem**.
   - As **70 impressões precificadas** existem **exclusivamente** em uma instância PostgreSQL portátil local (`127.0.0.1:55432/geekprice_index_dev`, pasta `.tools/index-pgdata` ignorada pelo Git), cujo processo estava **desligado** no início da auditoria e que possui **`0` organizações, `0` usuários e `0` produtos**.
   - Além disso, `src/db/connection-settings.ts:3-7` lê `DATABASE_SSL_CA_PATH="certs/supabase-ca.crt"` do `.env` e força handshake TLS mesmo contra `127.0.0.1:55432` (que não usa SSL), causando `Error: read ECONNRESET` (`HTTP 500`) se o Next.js for iniciado no Windows apenas trocando `DATABASE_URL`.
3. **Ausência de mapeamento cruzado entre TCGdex/Scryfall e MYP Cards (Causa B):**
   - Quando o lojista cadastra uma carta Pokémon pelo Cadastro Inteligente (`TCGdex` em português), `setName` é gravado como `"Coleção Básica"` e `collectorNumber` como `"4"` (`canonicalId = "base1-4"`).
   - O GeekPrice Index gravou os dados da MYP Cards em inglês (`setName = "Base Set"`, `collectorNumber = "004/102"`, `canonicalId = "pokemon_bs_004/102"`, ou com prefixos de série como `"XY 12: Evolutions"`, `"Platinum 4: Arceus"`, `"Sword & Shield 4: Vivid Voltage"`).
   - A função `matchStockPrinting` (`src/server/geekprice-index/core.ts:22-30`) ignora `canonicalId` e exige igualdade literal de strings normalizadas (`normalizePrintingText(stock.setName) === normalizePrintingText(card.setName)`). Como `"colecao basica" !== "base set"` e `"evolutions" !== "xy 12 evolutions"`, a correspondência cai para `"probable"` (`0` exatas) e **bloqueia a aprovação manual** (`canManuallyApprove = false`).
4. **Regressão de TypeScript e Build na árvore suja:**
   - Existem **10 arquivos rastreados modificados** e **31 caminhos não rastreados (untracked)** que nunca foram commitados no Git.
   - `npm run typecheck` (**exit code 2**) e `npm run build` (**exit code 1**) **FALHAM** atualmente por erro de tipagem em `scripts/verify-geekprice-index-http.ts(129,26)` e `(132,26)` (`Property 'toContainText' does not exist on type 'MakeMatchers<void, Page, {}>'`).

---

## B. RESPOSTAS DIRETAS ÀS 12 PERGUNTAS PRINCIPAIS (SEÇÃO 1)

### 1. Quando cadastro uma carta Pokémon, o sistema pesquisa automaticamente o preço BRL dela no GeekPrice Index?
- **Resposta:** **NÃO.**
- **Evidência:** Nem `createInventoryItem` (`src/server/inventory/service.ts:158-228`), nem `registerSmartCatalogCard` (`src/server/smart-registration/service.ts:12-65`), nem `linkAndCollect` (`src/server/market/service.ts:138-219`) consultam `index_cards` ou gravam em `index_inventory_links`. No teste real (Cenário A), após `POST /api/inventory` para `Charizard — Base Set — 004/102`, a consulta `SELECT count(*) FROM index_inventory_links` retornou **`0` registros** e `item.marketPrice` retornou **`null`**.

### 2. Ele consegue reconhecer a edição e o número da carta?
- **Resposta:** **APENAS PARCIALMENTE (somente dentro do modal isolado do `/market` e apenas se o nome da coleção estiver escrito exatamente igual ao padrão em inglês da MYP Cards).**
- **Evidência:**
  - `normalizeCollectorNumber` (`src/server/geekprice-index/core.ts:13-20`) normaliza `"004/102"` e `"0146"` para número `"4"` (denominador `"102"`) e `"146"`, reconhecendo zeros à esquerda.
  - Porém, `matchStockPrinting` (`src/server/geekprice-index/core.ts:22-30`) exige igualdade exata de `normalizePrintingText(stock.setName) === normalizePrintingText(card.setName)`.
  - Se a carta foi cadastrada com `setName = "Base Set"` e `collectorNumber = "004/102"`, retorna `match: "exact"`.
  - Se a carta foi cadastrada via **TCGdex (`pt-BR`)** com `setName = "Coleção Básica"` e `collectorNumber = "4"`, ou sem o prefixo da MYP (`"Evolutions"` em vez de `"XY 12: Evolutions"`, `"Revised Edition"` do Scryfall em vez de `"Revised"` da MYP), retorna **`0` correspondências exatas (`status: "probable"`)** e bloqueia a aprovação.
  - Além disso, mesmo quando encontra `status: "exact"`, o sistema **não seleciona automaticamente a carta** (`linkedCardId` permanece `null` até o lojista clicar manualmente no botão `"Escolher"`).

### 3. O preço brasileiro aparece na página do produto?
- **Resposta:** **NÃO.**
- **Evidência:** Ao abrir `Ver detalhes` de `Charizard — Base Set — 004/102` em `/products` (`src/components/product-manager.tsx:89` e `src/components/product-price-guidance.tsx:42-45`), mesmo **depois** de vincular a carta no GeekPrice Index, a tela exibe:
  - `Mercado BRL verificado: Sem cotação compatível`
  - `Sem cotação BRL verificada para esta variante`
  - `Simulação por custo: R$ 3.967,90` (ignorando a cotação de `R$ 5.180,43` do Index).
  - Captura de tela comprovada: `audit-01-products-detail-no-brl.png`.

### 4. O preço brasileiro aparece na lista do estoque?
- **Resposta:** **NÃO.**
- **Evidência:** A tabela de `/products` (`src/components/product-manager.tsx:82`) possui apenas as colunas `PRODUTO`, `SKU`, `CUSTO`, `PREÇO`, `QTD.`, `MARGEM` e `AÇÕES`. Não existe coluna de referência BRL na lista de estoque, e o payload de `GET /api/inventory` retorna `marketPrice: null`.

### 5. O sistema compara a cotação com o preço de venda do lojista?
- **Resposta:** **NÃO na tela de estoque (`/products`) nem na linha principal de `"Minhas cartas e preços"` (`/market`); SIM apenas dentro do modal isolado `"Index BRL · sugerir preço"` (`GeekPriceIndexStock`).**
- **Evidência:**
  - Na lista principal da aba `"Minhas cartas e preços"` (`src/components/market-my-cards.tsx:105`), o card de `Charizard — Base Set — 004/102` continua exibindo `Referência BRL verificada (30 dias): Sem cotação verificada` mesmo após vinculado no Index.
  - Somente ao clicar no botão `"Index BRL · sugerir preço"` e clicar em `"Escolher"` na edição candidata é que o modal `GeekPriceIndexStock` (`src/components/geekprice-index-stock.tsx:101-110`) exibe lado a lado `Referência BRL (média da fonte): R$ 5.180,43`, `Seu preço atual: R$ 5.000,00`, `Custo: R$ 2.500,00`, `Preço mínimo rentável: R$ 3.676,48` e `Sugestão: R$ 5.024,90 (+0.5%)`.

### 6. O GeekPrice utiliza a cotação para calcular uma recomendação de preço?
- **Resposta:** **NÃO no serviço oficial de recomendações (`/api/recommendations`); SIM apenas na simulação interna do modal `GeekPriceIndexStock` (`/api/geekprice-index/v1/inventory/:id/preview`).**
- **Evidência:**
  - `refreshRecommendations` (`src/server/recommendations/service.ts:42-176`) lê `listAllInventory()`, onde `item.marketPrice` é `null`. Por isso, grava na tabela `recommendations` apenas uma simulação baseada em custo (`R$ 3.967,90`) com a mensagem `"Sem cotação externa de mercado: cálculo restrito a custo, taxas e margem desejada."`.
  - Já `getIndexPricingPreview` (`src/server/geekprice-index/inventory.ts:85-108`) chama `calculateRecommendation` com `marketPrice: 5180.43`, gerando `minimumPrice: 3676.48` e `suggestedPrice: 5024.90`, mas esse cálculo não é salvo na tabela `recommendations`.

### 7. O Autopilot reconhece a referência do GeekPrice Index?
- **Resposta:** **NÃO.**
- **Evidência:** No teste real (Cenário A), após vincular `Charizard — Base Set — 004/102` no GeekPrice Index e chamar `POST /api/recommendations` e `GET /api/autopilot/queue?channel=counter`, o item no Autopilot retornou:
  - `marketPrice: null`
  - `safetyStatus: "suspicious_flagged"`
  - `safetyGate: "missing_market_reference"`
  - Na interface `/recommendations` (`audit-03-recommendations-autopilot.png`), a linha exibe `R$ 3.967,90 · Simulação por custo; não aplicável · Sem cotação BRL`, com o checkbox de aprovação **desabilitado**.

### 8. A referência é persistida e continua disponível depois de atualizar a página?
- **Resposta:** **SIM dentro do modal `"Index BRL · sugerir preço"`, mas NÃO no restante da aplicação.**
- **Evidência:** Quando o lojista clica em `"Escolher"` no modal, `POST /api/geekprice-index/v1/inventory/:id` grava o vínculo na tabela `index_inventory_links` (`organization_id`, `inventory_item_id`, `card_id`, `match_status`). Ao atualizar a página `/market` (`page.reload()`) e reabrir o modal `"Index BRL · sugerir preço"`, a impressão continua selecionada e a cotação `R$ 5.180,43` permanece disponível. Porém, fora desse modal (na linha do card em `/market`, em `/products` e em `/recommendations`), continua aparecendo `"Sem cotação verificada"` / `"Sem cotação BRL"`.

### 9. A referência vem realmente do PostgreSQL ou somente de dados apresentados na interface?
- **Resposta:** **Vem realmente do PostgreSQL (`index_cards` + `index_observations` + `index_sources` + `index_inventory_links`), mas exclusivamente do banco PostgreSQL local isolado (`127.0.0.1:55432/geekprice_index_dev`).**
- **Evidência:** Os endpoints `/api/geekprice-index/v1/*` executam `SELECT` via Drizzle ORM (`src/server/geekprice-index/service.ts` e `inventory.ts`) nas tabelas reais do banco `geekprice_index_dev`. Não há valores hardcoded nos componentes React (`src/components/geekprice-index-market.tsx` e `geekprice-index-stock.tsx`).

### 10. O sistema funciona quando a API do MYP Cards está indisponível?
- **Resposta:** **SIM para as 70 impressões já gravadas no banco local `geekprice_index_dev`; NÃO para novas buscas ao vivo na MYP Cards.**
- **Evidência:** Como a API do GeekPrice Index consulta apenas o PostgreSQL local (`index_cards` e `index_observations`) durante o uso da aplicação, a consulta às 70 cartas funciona 100% offline/sem chamar a MYP Cards em tempo de requisição. Já a coleta ao vivo (`scripts/refresh-geekprice-index.ts`) está bloqueada pelo Cloudflare da MYP Cards (`HTTP 403 Just a moment...`), registrado em `index_sources.last_error_at = 2026-10-15 19:15:00.785-03`.

### 11. Os preços aparecem para contas de lojas diferentes, sem expor os dados privados de cada organização?
- **Resposta:** **SIM (comprovado em teste real com duas organizações sintéticas `Loja A` e `Loja B`).**
- **Evidência:**
  - As tabelas de catálogo/preço do Index (`index_cards`, `index_observations`, `index_sources`) são globais para leitura autenticada: a `Loja B` consultou `GET /api/geekprice-index/v1/search?q=Charizard&game=pokemon` e recebeu `HTTP 200` com as cotações públicas.
  - As tabelas de estoque, vínculo e histórico (`inventory_items`, `index_inventory_links`, `price_change_batches`, `price_change_history`) filtram estritamente por `organization_id = actor.organizationId`: quando a `Loja B` tentou acessar `GET /api/geekprice-index/v1/inventory/${charizardLojaA}`, `GET .../preview` e `POST .../approve`, todas retornaram **`HTTP 404`** (`{"error":"Item não encontrado."}`).

### 12. As 70 cartas com preço existem apenas no banco local de teste ou também estão disponíveis no ambiente que estou utilizando atualmente?
- **Resposta:** **Existem APENAS no banco PostgreSQL portátil local de teste (`127.0.0.1:55432/geekprice_index_dev`). Elas NÃO existem no ambiente configurado em `.env` (Supabase comercial `postgres`) nem no banco de teste Supabase (`.env.phase81`).**
- **Evidência:**
  - Inspeção de leitura no banco comercial configurado em `.env` (`aws-0-us-east-1.pooler.supabase.com:5432/postgres`): possui 36 tabelas (`0000` a `0014`). As migrations `0015_yellow_zodiak` e `0016_fancy_lockjaw` constam como `recorded: false` e **nenhuma tabela `index_*` existe no banco comercial**.
  - O banco local `127.0.0.1:55432/geekprice_index_dev` (em `.tools/index-pgdata`) estava desligado quando a auditoria começou e não possui nenhum usuário, organização ou produto do lojista (`0` rows em `organizations`, `users`, `products`, `inventory_items`).

---

## C. ESTADO ATUAL DO REPOSITÓRIO, AMBIENTE E BANCOS (SEÇÃO 2 E 11)

### 1. Estado do Git e Árvore de Trabalho
- **Branch atual:** `main`
- **Commit `HEAD`:** `0ec262c6bf2081359b8eeea3f3f4a16ebbbfe6c8` (`feat(marketing): launch premium TCG storefront for GeekPrice platform`, 15/10/2026 14:53:46 -0300)
- **Divergência com `origin/main`:** `0` commits à frente / `0` atrás (sincronizado com `https://github.com/MuriloCortes/geek-price.git`).
- **Árvore de trabalho (dirty working tree):**
  - **10 arquivos rastreados modificados (não commitados):**
    1. [drizzle/meta/_journal.json](file:///c:/Users/murilo.rosa/Desktop/geek-price/drizzle/meta/_journal.json)
    2. [next-env.d.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/next-env.d.ts)
    3. [src/app/(private)/platform/page.tsx](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/(private)/platform/page.tsx)
    4. [src/app/layout.tsx](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/layout.tsx)
    5. [src/components/market-explorer.tsx](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/components/market-explorer.tsx)
    6. [src/components/market-my-cards.tsx](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/components/market-my-cards.tsx)
    7. [src/components/private-shell.tsx](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/components/private-shell.tsx)
    8. [src/components/smart-registration-modal.tsx](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/components/smart-registration-modal.tsx)
    9. [src/db/schema.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/db/schema.ts)
    10. [tsconfig.json](file:///c:/Users/murilo.rosa/Desktop/geek-price/tsconfig.json)
  - **31 caminhos não rastreados (untracked):** incluem as migrations `0014_geek_collections_and_commissions.sql`, `0015_yellow_zodiak.sql`, `0016_fancy_lockjaw.sql`, todo o módulo `src/server/geekprice-index/*`, `src/app/api/geekprice-index/*`, `src/components/geekprice-index-*.tsx`, `src/server/geek-workspace/*`, `scripts/*geekprice-index*`, `data/geekprice-index/*` e os relatórios `.md` anteriores. **Nada do GeekPrice Index nem da suíte Geek Workspace está commitado ou no GitHub.**

### 2. Comparação dos 3 Bancos de Dados Configurados

| Ambiente / Fonte | Host / Banco | Migrations Aplicadas | Tabelas `index_*` Existem? | Registros em `index_cards` | Organizações / Produtos |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Comercial (`.env`)** | `aws-0-us-east-1.pooler.supabase.com:5432/postgres` | `0000` a `0014` (`15` de `17`) — **`0015` e `0016` ausentes** | **NÃO (`0/6`)** | N/A (tabela inexistente) | Ambiente comercial |
| **Teste Isolado Supabase (`.env.phase81`)** | `aws-0-us-east-1.pooler.supabase.com:5432/geekprice_phase81_test_1791978720676` | `0000` a `0014` (`15` de `17`) — **`0015` e `0016` ausentes** | **NÃO (`0/6`)** | N/A (tabela inexistente) | Sintético Fase 8/9 |
| **PostgreSQL Portátil Local (`.tools/index-pgdata`)** | `127.0.0.1:55432/geekprice_index_dev` | `0000` a `0016` (**`17` de `17` completas**) | **SIM (`6/6`)** | **`70` cartas / `70` observações** | **`0` orgs / `0` users / `0` produtos** |

### 3. Auditoria de Relatórios Anteriores vs. Realidade Encontrada
Todos os 7 relatórios solicitados existem na raiz do projeto e foram lidos:
- [GEEKPRICE_INDEX_IMPLEMENTATION_REPORT.md](file:///c:/Users/murilo.rosa/Desktop/geek-price/GEEKPRICE_INDEX_IMPLEMENTATION_REPORT.md): Descrevia apenas a migration `0015` (4 tabelas `index_*`). Posteriormente foram adicionadas a migration `0016_fancy_lockjaw.sql` (`index_imports` e `index_inventory_links`), o modal `GeekPriceIndexStock` e a tela `/geekprice-index-admin`, mas essa evolução introduziu um erro de TypeScript em `scripts/verify-geekprice-index-http.ts:129,132` que quebrou `npm run typecheck` e `npm run build`.
- [GEEKPRICE_INDEX_EXPANSION_PLAN.md](file:///c:/Users/murilo.rosa/Desktop/geek-price/GEEKPRICE_INDEX_EXPANSION_PLAN.md), [GEEKPRICE_BRL_PRICING_IMPLEMENTATION_REPORT.md](file:///c:/Users/murilo.rosa/Desktop/geek-price/GEEKPRICE_BRL_PRICING_IMPLEMENTATION_REPORT.md), [GEEKPRICE_POST_AUDIT_FIXES_REPORT.md](file:///c:/Users/murilo.rosa/Desktop/geek-price/GEEKPRICE_POST_AUDIT_FIXES_REPORT.md), [GEEKPRICE_FULL_AUDIT_REPORT.md](file:///c:/Users/murilo.rosa/Desktop/geek-price/GEEKPRICE_FULL_AUDIT_REPORT.md), [GEEKPRICE_ACTION_PLAN.md](file:///c:/Users/murilo.rosa/Desktop/geek-price/GEEKPRICE_ACTION_PLAN.md), [DEPLOY_READINESS_GEEKPRICE.md](file:///c:/Users/murilo.rosa/Desktop/geek-price/DEPLOY_READINESS_GEEKPRICE.md): A pendência operacional **OPS-02** (rotação de senha/sessão do administrador ativo no banco comercial) continua pendente (`session_version: 0`, `updated_at: 2026-10-14T16:51:56.835Z` confirmado via `npm run admin:inspect-security`).

---

## D. AUDITORIA DO BANCO E DAS 70 IMPRESSÕES PRECIFICADAS (SEÇÃO 4)

Consultas estritamente de leitura executadas diretamente em `postgresql://geekprice@127.0.0.1:55432/geekprice_index_dev`:

| # | Pergunta da Auditoria | Resultado Exato no PostgreSQL (`geekprice_index_dev`) |
| :---: | :--- | :--- |
| **1** | Quantas cartas existem atualmente no índice (`index_cards`)? | **`70`** registros |
| **2** | Quantas têm preços BRL positivos (`price_min > 0 AND currency = 'BRL'`)? | **`70`** registros (`coverage_status = 'priced'`) |
| **3** | Quantas são Pokémon (`game = 'pokemon'`)? | **`50`** impressões (`Charizard`: 30; `Pikachu`: 18; `Pikachu (Delta Species)`: 1; `Pikachu (Full Art)`: 1) |
| **4** | Quantas são Magic (`game = 'magic'`)? | **`20`** impressões (`Lightning Bolt`: 17; `Counterspell`: 3) |
| **5** | Quantas possuem edição (`set_name` e `set_code` preenchidos)? | **`70`** (`100%`) |
| **6** | Quantas possuem número de colecionador (`collector_number` preenchido)? | **`70`** (`100%`) |
| **7** | Quantas possuem condição física (`condition` preenchido)? | **`0`** (`100%` com `condition IS NULL`) |
| **8** | Quantas possuem acabamento (`finish` preenchido)? | **`0`** (`100%` com `finish IS NULL`) |
| **9** | Quantas possuem idioma (`language` preenchido)? | **`0`** (`100%` com `language IS NULL`) |
| **10** | Quantas são identificáveis de maneira inequívoca? | **Por impressão (`game + name + set_name + collector_number`):** `70` (`match_status = 'exact'`). **Por variante física completa (`idioma + acabamento + condição`):** **`0`**. |
| **11** | Quantas observações estão desatualizadas (`observed_at < now() - interval '30 days'`)? | **`0`** |
| **12** | Quantas observações foram gravadas em datas diferentes? | **`1` único timestamp** para todas as 70 observações: `2026-10-15 18:57:41-03` (`2026-10-15T21:57:41.000Z`). Não há série temporal multi-data. |
| **13** | Quantas fontes existem (`index_sources`)? | **`1`** (`code = 'mypcards_public_api'`, `name = 'MYP Cards'`, `commercial_approved = false`, `acquisition_method = null`, `rights_reference = null`). |
| **14** | Quantas cotações vieram de importação CSV (`index_imports`) e quantas de coleta/seed? | **`0`** de importação CSV (`index_imports` tem `0` linhas); **`70`** carregadas via `scripts/seed-geekprice-index.ts` a partir do arquivo TSV `data/geekprice-index/mypcards-pilot.tsv` (coletado da API pública da MYP Cards em `2026-10-15T21:57:41Z`). |
| **15** | Qual foi a última atualização real? | Último sucesso (`last_success_at`): **`2026-10-15 18:57:41-03`**. Última tentativa com erro (`last_error_at`): **`2026-10-15 19:15:00.785-03`** (bloqueio Cloudflare HTTP 403). |

### Diferenciação Obrigatória de Métricas da Base

- **Buscas base do piloto:** `4` (`Charizard`, `Pikachu`, `Lightning Bolt`, `Counterspell`).
- **Nomes de cartas únicos (`COUNT(DISTINCT name)`):** `6` (`Charizard`, `Pikachu`, `Pikachu (Delta Species)`, `Pikachu (Full Art)`, `Lightning Bolt`, `Counterspell`).
- **Impressões únicas (`game + set_name + collector_number`):** `70`.
- **Variantes físicas conhecidas (`language IS NOT NULL AND finish IS NOT NULL AND condition IS NOT NULL`):** **`0`**.
- **Observações históricas (`index_observations`):** `70` (exatamente 1 retrato por impressão, todas no mesmo segundo `2026-10-15T21:57:41Z`).
- **Anúncios individuais armazenados:** `0` anúncios individuais (a tabela guarda apenas o agregado `price_min`, `provider_average`, `price_max` e a soma de quantidade reportada `SUM(available_quantity) = 974`).
- **Cartas com preço utilizável para auto-aplicação (`autoApplyEligible = true`):** **`0`** (todas têm `quality.score = 0.52`, `level = "limited"`, `commercialApproved = false`).
- **Cartas com preço apenas indicativo / revisão manual supervisionada:** **`70`** (e a aprovação manual só é permitida localmente com a flag `INDEX_ALLOW_UNAPPROVED_REFERENCE_MANUAL="true"` no banco `geekprice_index_dev`).
- **Nota de honestidade estatística:** `70/70` (`100%` dos registros com preço) **NÃO representa cobertura do catálogo TCG**; o script piloto selecionou exclusivamente resultados do endpoint `getcard` da MYP Cards que já possuíam `valor_min > 0`.

---

## E. ARQUITETURA REAL DO GEEKPRICE INDEX (SEÇÃO 3 E 10)

### 1. Mapeamento de Arquivos do GeekPrice Index
- **Schema e Migrations:** [src/db/schema.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/db/schema.ts#L597-L694), [drizzle/0015_yellow_zodiak.sql](file:///c:/Users/murilo.rosa/Desktop/geek-price/drizzle/0015_yellow_zodiak.sql), [drizzle/0016_fancy_lockjaw.sql](file:///c:/Users/murilo.rosa/Desktop/geek-price/drizzle/0016_fancy_lockjaw.sql)
- **Núcleo e Qualidade:** [src/server/geekprice-index/core.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/geekprice-index/core.ts)
- **Serviço de Consulta e Gravação:** [src/server/geekprice-index/service.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/geekprice-index/service.ts)
- **Vínculo com Estoque e Simulação:** [src/server/geekprice-index/inventory.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/geekprice-index/inventory.ts)
- **Aprovação Manual Supervisionada:** [src/server/geekprice-index/approval.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/geekprice-index/approval.ts)
- **Importação CSV em Lotes:** [src/server/geekprice-index/import-csv.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/geekprice-index/import-csv.ts), [src/server/geekprice-index/import-service.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/geekprice-index/import-service.ts)
- **Coletor MYP Cards:** [src/server/geekprice-index/mypcards.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/geekprice-index/mypcards.ts)
- **Rotas de API (`v1` e `admin`):**
  - `GET /api/geekprice-index/v1/search` ([route.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/api/geekprice-index/v1/search/route.ts))
  - `GET /api/geekprice-index/v1/cards/[id]/price` ([route.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/api/geekprice-index/v1/cards/%5Bid%5D/price/route.ts))
  - `GET /api/geekprice-index/v1/cards/[id]/history` ([route.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/api/geekprice-index/v1/cards/%5Bid%5D/history/route.ts))
  - `GET /api/geekprice-index/v1/sources` ([route.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/api/geekprice-index/v1/sources/route.ts))
  - `GET /api/geekprice-index/v1/coverage` ([route.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/api/geekprice-index/v1/coverage/route.ts))
  - `GET` / `POST /api/geekprice-index/v1/inventory/[id]` ([route.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/api/geekprice-index/v1/inventory/%5Bid%5D/route.ts))
  - `GET /api/geekprice-index/v1/inventory/[id]/preview` ([route.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/api/geekprice-index/v1/inventory/%5Bid%5D/preview/route.ts))
  - `POST /api/geekprice-index/v1/inventory/[id]/approve` ([route.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/api/geekprice-index/v1/inventory/%5Bid%5D/approve/route.ts))
  - `GET /api/geekprice-index/v1/inventory/[id]/history` ([route.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/app/api/geekprice-index/v1/inventory/%5Bid%5D/history/route.ts))
  - `POST /api/geekprice-index/admin/import/preview` e `/commit`
- **Componentes de Interface:** [src/components/geekprice-index-market.tsx](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/components/geekprice-index-market.tsx), [src/components/geekprice-index-stock.tsx](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/components/geekprice-index-stock.tsx), [src/components/geekprice-index-admin-import.tsx](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/components/geekprice-index-admin-import.tsx)

### 2. Classificação de Cada Ligação do Fluxo Completo

| Ligação do Fluxo | Classificação | Evidência Técnica |
| :--- | :--- | :--- |
| **1. Fonte brasileira → Coleta ao vivo (`mypcards.ts`)** | **Bloqueada por dependência externa** | Cloudflare Challenge (`HTTP 403`) em `https://mypcards.com/cards/getcard`; `last_error_at = 2026-10-15 19:15:00-03`. |
| **2. Fonte brasileira → Importação TSV/CSV (`seed-geekprice-index.ts` / `import-service.ts`) → PostgreSQL** | **Implementada e comprovada (apenas no banco local)** | 70 impressões e 70 observações gravadas em `geekprice_index_dev`; lote de 1.001 linhas testado com idempotência e cursor. |
| **3. PostgreSQL → API GeekPrice Index (`/api/geekprice-index/v1/*`)** | **Implementada e comprovada (apenas no banco local)** | Endpoints `search`, `price`, `history`, `sources`, `coverage` respondem `HTTP 200` com dados reais do PostgreSQL local e `401` sem sessão. |
| **4. Identificação da carta → Estoque (`createInventoryItem` / `registerSmartCatalogCard`)** | **Inexistente no ato do cadastro / Parcial e manual no modal de `/market`** | O cadastro de produto não consulta o Index. No modal de `/market`, `matchStockPrinting` falha para nomes de coleções em português (TCGdex `"Coleção Básica"`) ou sem prefixo MYP (`"XY 12: Evolutions"`). |
| **5. GeekPrice Index → Serviço de Estoque (`src/server/inventory/service.ts`)** | **Inexistente (Com defeito arquitetural confirmado)** | `listInventory`, `listAllInventory` e `listInventoryChunk` (`src/server/inventory/service.ts:18-118`) **não fazem JOIN** com `index_inventory_links` nem `index_cards`. `item.marketPrice` permanece `null`. |
| **6. GeekPrice Index → Precificação no modal isolado (`getIndexPricingPreview`)** | **Parcial (apenas dentro do modal de `/market`)** | Calcula `minimumPrice` e `suggestedPrice` usando `calculateRecommendation`, mas exige clique manual em `"Escolher"` e flag local `INDEX_ALLOW_UNAPPROVED_REFERENCE_MANUAL="true"`. |
| **7. GeekPrice Index → Serviço de Recomendações (`src/server/recommendations/service.ts`)** | **Inexistente** | `refreshRecommendations` lê `listAllInventory()`, enxerga `marketPrice = null` e gera apenas simulação por custo. |
| **8. GeekPrice Index → Autopilot (`src/server/autopilot/service.ts`)** | **Inexistente** | `getAutopilotQueue` e `runAutopilotReevaluationCycle` leem `listAllInventory()`/`listInventoryChunk()`, classificando todas as cartas vinculadas ao Index como `missing_market_reference` (`Sem cotação BRL`). |
| **9. Aprovação Manual Supervisionada → Histórico e Rollback (`approval.ts`)** | **Implementada e comprovada (apenas via modal de `/market` em ambiente local)** | Atualiza `inventory_items.price`, grava `price_change_batches` (`source = 'manual_index_approval'`) e `price_change_history`, e permite rollback via `/api/autopilot/rollback`. |

### 3. Correspondência entre Catálogos (TCGdex, Scryfall, MYP Cards e Cadastro Manual — Seção 10)

| Aspecto | TCGdex (`pt-BR` / `en`) | Scryfall (Magic) | GeekPrice Index (MYP Cards) | Consequência no `matchStockPrinting` (`core.ts:22-30`) |
| :--- | :--- | :--- | :--- | :--- |
| **`canonicalId`** | `base1-4`, `swsh4-25` | `m10-146` (ou UUID) | `pokemon_bs_004/102`, `pokemon_viv_025/185`, `magic_m10_0146` | **Ignorado** (e `createInventoryItem` em `inventory/service.ts:187-197` sequer salva `canonicalId` ou `catalogSource` ao criar via `/api/inventory`!). |
| **`setName` (Edição)** | `pt-BR`: `"Coleção Básica"`, `"Voltagem Vívida"`; `en`: `"Base Set"`, `"Vivid Voltage"` | `"Magic 2010"`, `"Revised Edition"`, `"Limited Edition Alpha"` | `"Base Set"`, `"Sword & Shield 4: Vivid Voltage"`, `"Magic 2010"`, `"Revised"`, `"Alpha"` | **Falha crítica de correspondência exata:** `"Coleção Básica"` ≠ `"Base Set"`; `"Vivid Voltage"` ≠ `"Sword & Shield 4: Vivid Voltage"`; `"Revised Edition"` ≠ `"Revised"`. Cai para `"probable"` e bloqueia aprovação! |
| **`collectorNumber`** | `"4"`, `"25"` (sem denominador `/102`) | `"146"` | `"004/102"`, `"025/185"`, `"0146"` | `normalizeCollectorNumber` remove zeros à esquerda (`"004"` → `"4"`, `"0146"` → `"146"`) e aceita ausência de denominador em um dos lados. Funciona bem. |
| **Acabamento / Condição / Idioma** | `holo`, `NM`, `pt-BR` | `nonfoil`, `NM`, `en` | `null`, `null`, `null` | O Index não tem metadados de variante; aplica penalidade de qualidade (`0.52`, `"limited"`) e exige checkbox de confirmação humana. |

---

## F. RESULTADO DOS TESTES REAIS DE CADASTRO (SEÇÃO 5 — CENÁRIOS A a E)

Todos os testes foram executados sobre o processo Next.js conectado estritamente ao banco isolado `postgresql://geekprice@127.0.0.1:55432/geekprice_index_dev` (comprovado via `SELECT current_database(), inet_server_addr(), inet_server_port()`), usando organizações sintéticas e deixando `0` resíduos ao final.

### Cenário A — Pokémon (`Charizard — Base Set — 004/102` e `Coleção Básica — 4`)
1. **Cadastro (`POST /api/inventory`):** Criado `Charizard`, coleção `"Base Set"`, número `"004/102"`, custo `R$ 2.500,00`, preço `R$ 5.000,00`, margem desejada `25%`.
2. **Vínculo automático no cadastro:** **`0` linhas** em `index_inventory_links`. `GET /api/inventory` retorna `marketPrice: null`.
3. **Página `/products` (Lista e Detalhes):**
   - Na lista: nenhuma coluna de referência BRL.
   - No modal `Ver detalhes` (`audit-01-products-detail-no-brl.png`): exibe **`Mercado BRL verificado: Sem cotação compatível`** e **`Sem cotação BRL verificada para esta variante · Piso mínimo calculado: R$ 3.676,48 · Simulação por custo: R$ 3.967,90`**.
   - Após `page.reload()`: permanece **`Sem cotação compatível`**.
4. **Página `/market`:**
   - Na aba `"Index BRL"`: pesquisar `"Charizard"` retorna 30 impressões; clicar em `Charizard · Base Set · #004/102` exibe `Mínimo anunciado: R$ 1.500,00`, `Média informada: R$ 5.180,43`, `Máximo anunciado: R$ 25.000,00`, fonte `MYP Cards`.
   - Na aba `"Minhas cartas e preços"`: a linha principal do card exibe **`Sem cotação verificada`**.
   - Ao clicar em `"Index BRL · sugerir preço"`: abre o modal `GeekPriceIndexStock` (`audit-02-market-index-modal.png`), que encontra 2 candidatas de número `004/102` (`Base Set` como `Impressão exata` e `Celebrations: Classic Collection` como `Correspondência provável`).
   - Antes de clicar em `"Escolher"`, `linkedCardId` é `null` e a simulação não aparece.
   - Após clicar em `"Escolher"` na edição `Base Set`, o vínculo é salvo em `index_inventory_links` (`matchStatus: "exact"`) e o modal exibe:
     - `Referência BRL (média da fonte): R$ 5.180,43`
     - `Seu preço atual: R$ 5.000,00` | `Custo: R$ 2.500,00`
     - `Preço mínimo rentável: R$ 3.676,48` | `Sugestão (margem projetada 38.3%): R$ 5.024,90`
   - Após `page.reload()` em `/market`: o vínculo persiste dentro do modal `"Index BRL · sugerir preço"`, **mas a linha principal de `"Minhas cartas e preços"` continua exibindo `"Sem cotação verificada"`**!
5. **Subcenário A2 (Cadastro via TCGdex `pt-BR`: `Charizard — Coleção Básica — 4`):**
   - `GET /api/geekprice-index/v1/inventory/:id` retorna `status: "probable"`, `0` candidatas exatas e `4` candidatas prováveis.
   - Mesmo escolhendo manualmente `Base Set · nº 004/102`, `canManuallyApprove` é **`false`** e a aprovação manual fica bloqueada!
6. **Página `/recommendations` (Autopilot):**
   - Mesmo com `Charizard — Base Set — 004/102` vinculado em `index_inventory_links`, a página `/recommendations` (`audit-03-recommendations-autopilot.png`) e `GET /api/autopilot/queue` exibem **`Sem cotação BRL`**, **`Simulação por custo; não aplicável` (`R$ 3.967,90`)** e `safetyGate: "missing_market_reference"`.

### Cenário B — Magic (`Lightning Bolt — Magic 2010 — 0146`)
- Cadastrado `Lightning Bolt`, coleção `"Magic 2010"`, número `"0146"`, custo `R$ 5,00`, preço `R$ 10,00`, margem `25%`.
- Em `/products` e `/recommendations`: aparece como **`Sem cotação compatível`** / **`Sem cotação BRL`**.
- No modal `"Index BRL · sugerir preço"` em `/market`: reconhece `magic_m10_0146` com `status: "exact"` (`askingMin: R$ 9,99`, `providerAverage: R$ 11,85`, `askingMax: R$ 14,00`), calcula `minimumPrice: R$ 7,36` e `suggestedPrice: R$ 11,90`, e persiste o vínculo em `index_inventory_links`.

### Cenário C — Carta não cadastrada no Index
- Testados dois casos:
  1. `Bulbasaur — Base Set — 044/102` (carta ausente do índice): retorna `status: "not_found"`, `candidates: []`, `pricing: null`. O modal exibe `"Sem correspondência no Index. Esta edição ainda não tem referência brasileira na base pesquisada. Nenhum preço foi estimado."`
  2. `Charizard — Paldean Fates — 234/091` (carta cujo nome existe no índice, mas edição/número `234` não existem): retorna `status: "not_found"`, `candidates: []`, `linkedCardId: null`. **Nenhum preço é inventado.**

### Cenário D — Mesmo nome, edições diferentes (`Base Set` vs. `Base Set 2`)
- Cadastrados na mesma organização:
  1. `Charizard — Base Set — 004/102` → vincula ao `cardId` `ba5e0e12-7983-4485-8494-1791692bd701` (`askingMin: R$ 1.500,00`, `providerAverage: R$ 5.180,43`).
  2. `Charizard — Base Set 2 — 004/130` → vincula ao `cardId` `10b83979-1412-4413-996f-fd5abd2fc324` (`askingMin: R$ 2.790,00`, `providerAverage: R$ 4.645,00`).
- **Resultado:** Os vínculos e preços não se misturam (`isolatedCorrectly: true`), inclusive porque o filtro de denominador em `matchStockPrinting` (`core.ts:27`) separa `/102` de `/130`.

### Cenário E — Acabamento e condição ausentes na fonte
- Como `index_cards` tem `language = null`, `finish = null`, `condition = null`, `evaluateIndexReferenceQuality` (`src/server/geekprice-index/core.ts:39-61`) atribui `score: 0.52`, `level: "limited"`, `autoApplyEligible: false`.
- Tentativa de aprovar via `POST /api/geekprice-index/v1/inventory/:id/approve` com `confirmedVariant: false` é rejeitada com **`HTTP 422`**.
- Com `confirmedVariant: true` e `expectedCurrentPrice: "5000.00"`, atualiza o preço em `inventory_items` e permite reversão imediata (`POST /api/autopilot/rollback`), restaurando `R$ 5.000,00` e marcando o lote como `reverted`.

---

## G. CAUSA RAIZ DOS PROBLEMAS ENCONTRADOS (SEÇÃO 6 — SITUAÇÕES A a K)

### Confirmação das Hipóteses A a K da Seção 6

| Código | Hipótese Investigada | Status na Auditoria |
| :---: | :--- | :--- |
| **A** | O produto cadastrado não possui os identificadores necessários para corresponder ao índice. | **CONFIRMADA PARCIALMENTE** (`createInventoryItem` não grava `canonicalId` nem `catalogSource`; produtos com `category` genérica como `"TCG"` retornam `stockGame = null`). |
| **B** | O GeekPrice Index usa códigos/nomes MYP, enquanto o estoque usa TCGdex ou Scryfall, sem mapeamento cruzado. | **CONFIRMADA CRITICAMENTE** (TCGdex `pt-BR` grava `"Coleção Básica"` e MYP usa prefixos como `"XY 12: Evolutions"`, quebrando `matchStockPrinting`). |
| **C** | O serviço de estoque não consulta o GeekPrice Index. | **CONFIRMADA CRITICAMENTE** (`src/server/inventory/service.ts` nunca consulta `index_inventory_links` ou `index_cards`). |
| **D** | O serviço consulta o índice, mas encontra correspondência ambígua/provável. | **CONFIRMADA** (quando `setName` difere entre TCGdex/Scryfall e MYP, o match vira `"probable"` e bloqueia aprovação). |
| **E** | O banco atual não possui a carga de 70 impressões. | **CONFIRMADA CRITICAMENTE** (o banco comercial em `.env` e o `.env.phase81` não possuem as tabelas `index_*` nem as 70 cartas). |
| **F** | O frontend não solicita a referência. | **CONFIRMADA EM `/products` E `/recommendations`** (`product-manager.tsx`, `product-price-guidance.tsx` e `autopilot-view.tsx` jamais chamam `/api/geekprice-index/v1/*`). |
| **G** | A API retorna o preço, mas o componente não o exibe. | **DESCARTADA** (onde a API do Index é chamada — aba `"Index BRL"` e modal `GeekPriceIndexStock` — o componente exibe; nos demais lugares a API de estoque retorna `marketPrice: null`). |
| **H** | A cotação aparece no Mercado, mas não alimenta o serviço de recomendações. | **CONFIRMADA CRITICAMENTE** (`recommendations/service.ts` e `autopilot/service.ts` ignoram o GeekPrice Index). |
| **I** | O sistema exige metadados que a fonte não fornece. | **CONFIRMADA** (`inventory/service.ts` exige `verified = 'true'`, `condition` e `finish`; e `inventory.ts:105` bloqueia aprovação sem `commercialApproved = true` exceto com flag local). |
| **J** | O dado foi salvo corretamente, mas não permanece após o reload. | **CONFIRMADA PARCIALMENTE** (permanece salvo em `index_inventory_links` dentro do modal, mas ao recarregar `/market` a linha principal do card continua lendo `item.marketPrice = null` de `/api/inventory`). |
| **K** | O Index foi implementado num banco local que não corresponde ao ambiente onde utilizo o GeekPrice. | **CONFIRMADA CRITICAMENTE** (`127.0.0.1:55432/geekprice_index_dev` vs. Supabase comercial em `.env`). |

### Detalhamento Técnico de Cada Falha (Arquivo, Função, Linha, Causa, Impacto, Correção e Reprodução)

#### Falha 1 — Serviço de estoque ignora completamente o GeekPrice Index (Causas C, F, H, J)
- **Arquivo:** [src/server/inventory/service.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/inventory/service.ts#L17-L118)
- **Funções e Linhas:** `referenceObservationPriceExpr` (linhas `17–28`), `unverifiedReferenceObservationExpr` (linhas `30–46`), `listAllInventory` (linhas `49–87`), `listInventoryChunk` (linhas `90–156`), `listInventory` (linhas `292–360`).
- **Causa:** `marketPrice` e `hasUnverifiedReference` são calculados apenas sobre `external_listings` + `sources` + `price_observations`. Não há `LEFT JOIN` nem subquery em `index_inventory_links` + `index_cards` + `index_observations`.
- **Impacto:** `/products` (lista e modal de detalhes), a linha principal de `"Minhas cartas e preços"` em `/market`, `/api/recommendations` e `/api/autopilot/queue` exibem `marketPrice = null` (`"Sem cotação compatível"` / `"Sem cotação BRL"`) mesmo para cartas vinculadas no GeekPrice Index.
- **Correção necessária:** Incluir no cálculo de referência do estoque (ou em um campo dedicado `indexReferencePrice` integrado a `listInventory`/`listAllInventory`/`listInventoryChunk`) a leitura do vínculo confirmado em `index_inventory_links` (`match_status = 'exact'`) + observação atual (`<= 30 dias`) em `index_observations`, propagando `hasUnverifiedReference = true` quando `commercial_approved = false`.
- **Prioridade:** **P0 (Crítica)**
- **Como reproduzir:** Cadastrar `Charizard — Base Set — 004/102`, vincular a impressão em `/market` → `"Index BRL · sugerir preço"`, abrir `/products` → `Ver detalhes` ou `/recommendations`.

#### Falha 2 — Banco comercial em `.env` sem migrations `0015`/`0016` e falha de TLS no banco local (Causas E, K)
- **Arquivos:** [src/db/connection-settings.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/db/connection-settings.ts#L3-L14), [scripts/index-isolated-db.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/scripts/index-isolated-db.ts#L1-L16)
- **Função e Linha:** `databaseTlsOptions` (`src/db/connection-settings.ts:3-7`).
- **Causa:**
  1. As migrations `0015_yellow_zodiak.sql` e `0016_fancy_lockjaw.sql` só foram aplicadas no PostgreSQL portátil `.tools/index-pgdata` (`127.0.0.1:55432/geekprice_index_dev`), nunca no banco configurado em `.env`.
  2. Quando o desenvolvedor tenta apontar `DATABASE_URL` para `127.0.0.1:55432/geekprice_index_dev` no Windows, o Next.js carrega `DATABASE_SSL_CA_PATH="certs/supabase-ca.crt"` do `.env` e `databaseTlsOptions()` força SSL/TLS contra o Postgres local sem SSL, derrubando todas as queries com `Error: read ECONNRESET`.
- **Impacto:** O GeekPrice Index não existe no ambiente padrão do lojista e falha com `HTTP 500` localmente no Windows se `DATABASE_SSL_CA_PATH` não for limpo dentro do processo Node.
- **Correção necessária:** Em `databaseTlsOptions()` (`src/db/connection-settings.ts:3`), ignorar `DATABASE_SSL_CA_PATH` quando o hostname de `DATABASE_URL` for `127.0.0.1`, `localhost` ou `::1` (ou quando `sslmode=disable`); e planejar a janela controlada de aplicação das migrations `0015` e `0016`.
- **Prioridade:** **P0 (Crítica)**
- **Como reproduzir:** Executar `npm run db:inspect` com `.env` (mostra `0015` e `0016` como `recorded: false`), ou iniciar `next dev` com `DATABASE_URL="postgresql://geekprice@127.0.0.1:55432/geekprice_index_dev"` no PowerShell e chamar `/api/geekprice-index/v1/coverage`.

#### Falha 3 — Ausência de mapeamento cruzado de edições TCGdex / Scryfall ↔ MYP Cards (Causa B, D)
- **Arquivo:** [src/server/geekprice-index/core.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/geekprice-index/core.ts#L22-L30)
- **Função e Linha:** `matchStockPrinting` (linhas `22–30`).
- **Causa:** `sameSet` compara `normalizePrintingText(stock.setName) === normalizePrintingText(card.setName)`. A MYP Cards usa nomes em inglês com prefixo de bloco (`"XY 12: Evolutions"`, `"Sword & Shield 4: Vivid Voltage"`, `"Platinum 4: Arceus"`, `"Revised"`), enquanto o TCGdex em português cadastra `"Coleção Básica"`, `"Evoluções"`, `"Voltagem Vívida"` (ou em inglês sem prefixo `"Evolutions"`, `"Vivid Voltage"`) e o Scryfall cadastra `"Revised Edition"`. Além disso, `createInventoryItem` (`src/server/inventory/service.ts:187-197`) não persiste `canonicalId` nem `catalogSource` na tabela `product_variants`.
- **Impacto:** Cartas cadastradas via Cadastro Inteligente (TCGdex `pt-BR`) ou Scryfall caem em `match = "probable"` (`status = "probable"`) e têm aprovação manual bloqueada em `src/server/geekprice-index/inventory.ts:105` e `approval.ts:16`.
- **Correção necessária:** Persistir `catalogSource` e `canonicalId` em `createInventoryItem`, adicionar tabela/dicionário de equivalência de `setCode`/`setName` entre TCGdex (`base1` ↔ `BS` / `"Coleção Básica"` ↔ `"Base Set"`), Scryfall (`3ed` ↔ `REV` / `"Revised Edition"` ↔ `"Revised"`) e MYP Cards, e normalizar prefixos de série da MYP (`"XY 12: Evolutions"` → `"Evolutions"`).
- **Prioridade:** **P0 (Crítica)**
- **Como reproduzir:** Cadastrar `Charizard` com `setName: "Coleção Básica"`, `collectorNumber: "4"` e consultar `GET /api/geekprice-index/v1/inventory/:id`.

#### Falha 4 — Detecção de jogo (`stockGame`) falha para categorias customizadas (Causa A)
- **Arquivo:** [src/server/geekprice-index/inventory.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/geekprice-index/inventory.ts#L33-L37)
- **Função e Linha:** `stockGame` (linhas `33–37`) e `createInventoryItem` (`src/server/inventory/service.ts:187-197`).
- **Causa:** Como `createInventoryItem` deixa `productVariants.catalogSource = null`, `stockGame` depende exclusivamente de regex em `products.category` (`/pok[eé]mon/i` ou `/magic/i`). Se o lojista cadastrar `category = "TCG"`, `"Cartas Avulsas"` ou `"Singles"`, `stockGame` retorna `null` e `getInventoryIndexMatches` retorna `status: "not_found"` mesmo que a carta exista no Index.
- **Impacto:** Produtos cadastrados manualmente com categorias genéricas nunca encontram correspondência no GeekPrice Index.
- **Correção necessária:** Gravar `catalogSource` no cadastro e permitir fallback de busca no Index sem exigir que `category` contenha literalmente `"Pokémon"` ou `"Magic"`.
- **Prioridade:** **P1 (Alta)**
- **Como reproduzir:** Cadastrar `Charizard`, `category: "TCG"`, `setName: "Base Set"`, `collectorNumber: "004/102"` e abrir `"Index BRL · sugerir preço"`.

#### Falha 5 — Erro de compilação TypeScript quebra `npm run typecheck` e `npm run build`
- **Arquivo:** [scripts/verify-geekprice-index-http.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/scripts/verify-geekprice-index-http.ts#L129-L132)
- **Função e Linha:** `main` (linhas `129` e `132`).
- **Causa:** Uso de `await expect(page).toContainText(...)` passando `Page` em vez de `Locator` (`page.locator("body")`). Como `tsconfig.json` inclui `**/*.ts`, o typechecker do Next.js durante `npm run build` valida `scripts/verify-geekprice-index-http.ts` e aborta a compilação de produção.
- **Impacto:** `npm run typecheck` falha com `exit code 2` e `npm run build` falha com `exit code 1`.
- **Correção necessária:** Substituir `expect(page).toContainText(...)` por `expect(page.locator("body")).toContainText(...)` nas linhas `129` e `132` de `scripts/verify-geekprice-index-http.ts`.
- **Prioridade:** **P0 (Crítica — Bloqueador de Build)**
- **Como reproduzir:** Executar `npm run typecheck` ou `npm run build`.

#### Falha 6 — Cotações assinadas de `persistBrazilianQuoteForInventoryItem` nunca ativam `hasUnverifiedReference`
- **Arquivos:** [src/server/market/brazilian-service.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/market/brazilian-service.ts#L287-L296) e [src/server/inventory/service.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/server/inventory/service.ts#L38-L39)
- **Funções e Linhas:** `persistBrazilianQuoteForInventoryItem` (`brazilian-service.ts:287-296`) vs. `unverifiedReferenceObservationExpr` (`inventory/service.ts:38-39`).
- **Causa:** `unverifiedReferenceObservationExpr` exige `coalesce(el.metadata->>'condition', '') = product_variants.condition` e `coalesce(el.metadata->>'finish', '') = product_variants.finish`, mas `persistBrazilianQuoteForInventoryItem` grava `external_listings.metadata` sem `condition` e sem `finish`.
- **Impacto:** `hasUnverifiedReference` retorna sempre `false` após vincular cotação via `/api/market/brazilian-quotes`, quebrando inclusive o teste de integração `tests/integration/phase9.integration.test.ts:604`.
- **Correção necessária:** Gravar `condition: item.condition` e `finish: item.finish` (ou ajustar a subquery de referência não verificada) em `persistBrazilianQuoteForInventoryItem`.
- **Prioridade:** **P1 (Alta)**
- **Como reproduzir:** Executar `npx vitest run --config vitest.integration.config.ts tests/integration/phase9.integration.test.ts`.

---

## H. INTEGRAÇÃO COM ESTOQUE, PRECIFICAÇÃO, MOTOR FINANCEIRO E AUTOPILOT (SEÇÕES 7 E 8)

### 1. Auditoria do Motor Financeiro (Seção 7)
A função pura `calculateRecommendation` ([src/lib/pricing.ts](file:///c:/Users/murilo.rosa/Desktop/geek-price/src/lib/pricing.ts#L33-L130)) implementa a fórmula:
$$\text{minimumPrice} = \text{roundCurrency}\left(\frac{\text{cost}}{1 - (\text{feesPercent} + \text{additionalCostsPercent} + \text{minimumMarginPercent})/100}\right)$$
$$\text{desiredPrice} = \text{roundCurrency}\left(\frac{\text{cost}}{1 - (\text{feesPercent} + \text{additionalCostsPercent} + \text{desiredMarginPercent})/100}\right)$$

- **Verificação com os parâmetros da Seção 7 (`cost = R$ 100,00`, `feePercent = 12%`, `desiredMarginPercent = 25%`, `minimumMarginPercent = 20%`):**
  - Piso mínimo rentável (`minimumPrice`, margem mínima 20%): $\frac{100}{1 - 0,12 - 0,20} = \frac{100}{0,68} = \text{R\$ } 147,06$.
  - Alvo rentável (`desiredPrice`, margem desejada 25%): $\frac{100}{1 - 0,12 - 0,25} = \frac{100}{0,63} = \text{R\$ } 158,73$ (arredondado no modo `ends_90` para `R$ 158,90`).
- **Teste real de proteção de piso com referência de mercado abaixo do custo (`Lightning Bolt`, `cost = R$ 100,00`, `marketReference = R$ 11,85`):**
  - `GET /api/geekprice-index/v1/inventory/:id/preview` retornou:
    - `referenceValue: "11.85"`
    - `minimumPrice: 147.06`
    - `suggestedPrice: 158.90`
  - **Comprovado:** Mesmo quando a cotação do GeekPrice Index (`R$ 11,85`) é muito inferior ao custo (`R$ 100,00`), `calculateRecommendation` usa `Math.max(desiredPrice, marketTarget, minimumPrice)` e **jamais sugere preço abaixo do piso mínimo rentável**.

### 2. Auditoria do Autopilot e Travas de Segurança (Seção 8)
- **O Autopilot utiliza o GeekPrice Index?** **NÃO.** (`src/server/autopilot/service.ts:365-385` lê `listAllInventory()`, que ignora `index_inventory_links`).
- **E dentro do próprio GeekPrice Index, uma cotação da MYP Cards pode ser auto-aplicada?** **NÃO.** Existem três travas independentes:
  1. `evaluateIndexReferenceQuality` (`src/server/geekprice-index/core.ts:57-59`): exige `score >= 0.85`, `exactPrinting === true`, `stale === false`, `knownCondition === true`, `knownFinish === true` e `knownLanguage === true`. Como a MYP Cards não informa condição, acabamento nem idioma (`score = 0.52`), `autoApplyEligible` é sempre **`false`**.
  2. `getIndexPricingPreview` (`src/server/geekprice-index/inventory.ts:104`): define hardcoded `manualReviewRequired: true, autoApplyEligible: false`.
  3. `approveIndexInventoryPrice` (`src/server/geekprice-index/approval.ts:13-22`): exige `input.confirmedVariant === true`, `selected.match === "exact"`, `selected.reference.status === "current"`, `Math.abs(preview.pricing.percentageChange) <= 15`, `expectedCurrentPrice` idêntico ao banco (lock otimista `FOR UPDATE` em `inventory_items`), e fonte homologada (`commercialApproved === true` ou piloto local explícito).

---

## I. ESTADO REAL DA INTERFACE E NAVEGAÇÃO (SEÇÃO 9)

Verificação executada em navegador Chromium headless (1440×1000) e inspeção dos componentes:

| Tela / Rota | Estado Real Observado | Exibe Preço do GeekPrice Index? |
| :--- | :--- | :--- |
| **1. `/products` (Estoque)** | Lista os itens do estoque com SKU, custo, preço, quantidade e margem. Não há coluna de preço de mercado BRL. | **NÃO** |
| **2. `/products` → Modal de Cadastro (`SmartRegistrationModal`)** | Permite cadastro inteligente (TCGdex/Scryfall) ou manual. Não consulta o GeekPrice Index ao salvar. | **NÃO** |
| **3. `/products` → Modal `Ver detalhes`** | Exibe dados da variante e o bloco `Orientação de preço` (`ProductPriceGuidance`). Mostra `"Mercado BRL verificado: Sem cotação compatível"` mesmo para cartas vinculadas no Index. | **NÃO** |
| **4. `/market` → Aba `"Index BRL"` (`GeekPriceIndexMarket`)** | Permite buscar nas 70 cartas por nome e filtro de jogo (`Pokémon`/`Magic`), listar edições, selecionar uma impressão e ver mínimo (`R$ 1.500,00`), média (`R$ 5.180,43`), máximo (`R$ 25.000,00`), histórico, qualidade (`52%`) e link de atribuição para `MYP Cards`. | **SIM (apenas no banco local `geekprice_index_dev`)** |
| **5. `/market` → Aba `"Minhas cartas e preços"` (`MarketMyCards`)** | A linha principal de cada carta lê `item.marketPrice` de `/api/inventory` e exibe `"Sem cotação verificada"`. Possui o botão `"Index BRL · sugerir preço"`, que abre o modal `GeekPriceIndexStock` onde o vínculo, a cotação do Index, a simulação financeira, a aprovação manual e o rollback funcionam. | **Parcial (NÃO na linha do card; SIM dentro do modal `"Index BRL · sugerir preço"`)** |
| **6. `/recommendations` (Recomendações / Autopilot)** | Exibe todas as cartas como `"Sem cotação BRL"` / `"Simulação por custo; não aplicável"`, ignorando os vínculos gravados em `index_inventory_links`. | **NÃO** |
| **7. `/geekprice-index-admin`** | Exibe 10 contadores de cobertura (`70` cartas, `70` com preço, `0` sem preço, `0` variantes completas), aviso de que `70/70` não representa cobertura do mercado, status da fonte `MYP Cards` e formulário de importação CSV com prévia e validação de direitos (`GeekPriceIndexAdminImport`). | **SIM (apenas para administradores no banco local)** |

---

## J. AUDITORIA DE FUNCIONALIDADES RECENTES (SEÇÃO 12)

Além do GeekPrice Index, a árvore de trabalho contém modificações e arquivos não rastreados de funcionalidades recentes:
1. **Coleções Geek (`/collections`) e Encomendas Geek (`/commissions`):**
   - Implementadas na migration `0014_geek_collections_and_commissions.sql` (já aplicada no banco comercial!) e em `src/server/geek-workspace/service.ts`.
   - Possuem 5 testes de integração em `tests/integration/geek-workspace.integration.test.ts` (todos passando: isolamento multi-tenant, cálculo de acervo, empréstimos, controle otimista de versão `409` e comissões).
   - **Problema:** Os arquivos `drizzle/0014_geek_collections_and_commissions.sql`, `src/server/geek-workspace/*`, `src/app/(private)/collections/*` e `src/app/(private)/commissions/*` estão **untracked no Git**! Ou seja, a migration `0014` já foi rodada no banco comercial Supabase, mas o código e o arquivo SQL não foram commitados no repositório.
2. **Storefront / Vitrine de Marketing (`0ec262c`):** Commitada em `main`, sem regressões observadas.

---

## K. TESTES EXECUTADOS E EVIDÊNCIAS (SEÇÃO 13)

| Comando / Suíte Executada | Ambiente / Alvo | Código de Saída | Resultado Real Observado |
| :--- | :--- | :---: | :--- |
| `npm run typecheck` (`tsc --noEmit`) | Árvore local | **`2` (FALHOU)** | Falha em `scripts/verify-geekprice-index-http.ts(129,26)` e `(132,26)`: `Property 'toContainText' does not exist on type 'MakeMatchers<void, Page, {}>'`. |
| `npm run lint` (`eslint .`) | Árvore local | **`0` (PASSOU)** | `0` erros, `9` warnings (`unused vars` em `verify-brl-browser-e2e.mjs` e `window.location.href` em `login-form.tsx` / `onboarding-form.tsx`). |
| `npm test` (`vitest run`) | Unitário (Node) | **`0` (PASSOU)** | `32` arquivos de teste, **`147` testes passaram** em `2.80s`. |
| `npm run db:check` | Snapshots Drizzle | **`0` (PASSOU)** | `17` snapshots válidos (`0000` a `0016`), `0` declarações de drift. |
| `npm run build` (`next build --webpack`) | Produção local | **`1` (FALHOU)** | Compila o bundle Webpack em `18.7s`, mas falha na etapa `Running TypeScript` pelos mesmos 2 erros em `scripts/verify-geekprice-index-http.ts:129,132`. |
| `npx tsx scripts/verify-geekprice-index.ts` | `127.0.0.1:55432/geekprice_index_dev` | **`0` (PASSOU)** | Confirmou `cards: 70`, `observations: 70`, `askingMin: "1500.00"`, `providerAverage: "5180.43"`, `duplicateBlocked: true`. |
| `vitest run --config vitest.integration.config.ts` | `127.0.0.1:55432/geekprice_phase81_test_202610152255` | **`1` (PARCIAL)** | `geekprice-index.integration.test.ts` (**PASSOU**, 1.001 linhas idempotentes) e `geek-workspace.integration.test.ts` (**PASSOU**, 5/5 testes). `phase81` (8 falhas) e `phase9` (3 falhas) falham por regressões anteriores (`db.$client.reserve` perdido no Proxy de `src/db/index.ts:53-55`, filtro `verified = 'true'` em `inventory/service.ts` e `condition`/`finish` ausentes em `brazilian-service.ts:287`). |
| Script E2E Real Cenários A–E (`audit-e2e-scenarios.ts` + Playwright Chromium) | `http://127.0.0.1:3199` + `127.0.0.1:55432/geekprice_index_dev` | **`0` (PASSOU)** | Executou os Cenários A1, A2, B, C, D, E, proteção de piso financeiro, aprovação/rollback, isolamento multiempresa e capturou 3 screenshots em navegador real, restaurando o banco ao estado inicial (`70` cartas, `0` orgs/produtos). |

---

## L. LISTA PRIORIZADA DE CORREÇÕES NECESSÁRIAS

1. **[P0 — Bloqueador de Build] Corrigir `scripts/verify-geekprice-index-http.ts:129,132`:**
   - Trocar `await expect(page).toContainText(...)` por `await expect(page.locator("body")).toContainText(...)` para restaurar `npm run typecheck` e `npm run build`.
2. **[P0 — Integração Estoque/Recomendações/Autopilot] Integrar `index_inventory_links` + `index_observations` ao `src/server/inventory/service.ts`:**
   - Nas queries `listInventory`, `listAllInventory` e `listInventoryChunk`, quando um item não tiver cotação verificada em `price_observations`, buscar a referência vinculada em `index_inventory_links` (`match_status = 'exact'`) com observação recente (`<= 30 dias`) em `index_observations` e expor o preço na listagem de `/products`, no modal `Ver detalhes`, na linha principal de `"Minhas cartas e preços"` em `/market` e nas simulações de `/recommendations` (mantendo a trava `hasUnverifiedReference = true` / revisão manual enquanto a fonte não for homologada ou não tiver condição/acabamento).
3. **[P0 — Vínculo Automático no Cadastro e Mapeamento de Edições] Vincular automaticamente no cadastro e mapear sets TCGdex/Scryfall ↔ MYP Cards:**
   - Persistir `catalogSource` e `canonicalId` em `createInventoryItem` (`src/server/inventory/service.ts:187-197`).
   - Ao cadastrar ou atualizar um item (`createInventoryItem` / `registerSmartCatalogCard`), se houver exatamente 1 correspondência `exact` no GeekPrice Index, criar automaticamente o vínculo em `index_inventory_links`.
   - Normalizar prefixos de série da MYP Cards (`"XY 12: Evolutions"` → `"Evolutions"`, `"Sword & Shield 4: Vivid Voltage"` → `"Vivid Voltage"`) e adicionar dicionário de tradução para sets clássicos em português/inglês (`"Coleção Básica"` ↔ `"Base Set"`, `"Revised Edition"` ↔ `"Revised"`).
4. **[P0 — Conexão Local Windows] Corrigir `databaseTlsOptions` em `src/db/connection-settings.ts:3-7`:**
   - Não aplicar `DATABASE_SSL_CA_PATH` quando o host de `DATABASE_URL` for `127.0.0.1`, `localhost` ou `::1`.
5. **[P1 — Detecção de Jogo e Metadados de Cotações Assinadas]:**
   - Em `src/server/geekprice-index/inventory.ts:33-37` (`stockGame`), permitir fallback por busca no `index_cards` quando `category` não contiver `"Pokémon"` ou `"Magic"`.
   - Em `src/server/market/brazilian-service.ts:287-296`, incluir `condition: item.condition` e `finish: item.finish` em `external_listings.metadata` para que `hasUnverifiedReference` funcione corretamente.
6. **[P1 — Higiene de Git e Migrations]:**
   - Commitar os arquivos da migration `0014` (já aplicada no banco comercial) e, após corrigir as falhas P0 acima, commitar as migrations `0015` e `0016` e o módulo do GeekPrice Index.

---

## M. PLANO DE AÇÃO PARA INTEGRAR REALMENTE O PREÇO BRL AO ESTOQUE

1. **Etapa 1 — Correção de Build e TLS Local (15 min):**
   - Ajustar `scripts/verify-geekprice-index-http.ts:129,132` e `src/db/connection-settings.ts:3-7`. Validar com `npm run typecheck` e `npm run build`.
2. **Etapa 2 — Normalização de Edições e Persistência de Catálogo no Cadastro (45 min):**
   - Gravar `catalogSource` e `canonicalId` em `createInventoryItem`.
   - Atualizar `matchStockPrinting` (`src/server/geekprice-index/core.ts:22-30`) para comparar tanto o nome completo quanto o sufixo após `":"` (ex.: `"XY 12: Evolutions"` ↔ `"Evolutions"`) e mapear nomes traduzidos do TCGdex (`"Coleção Básica"` ↔ `"Base Set"`).
   - Fazer `createInventoryItem` e `getInventoryIndexMatches` auto-vincularem em `index_inventory_links` quando `exactCount === 1`.
3. **Etapa 3 — Unificação de Leitura em `src/server/inventory/service.ts` (1h):**
   - Adicionar subquery/join de `index_inventory_links` + `index_observations` em `listInventory`, `listAllInventory` e `listInventoryChunk`, preenchendo `marketPrice` (ou `referencePriceBrl` + `hasUnverifiedReference = true`) para itens com vínculo `exact` e observação `<= 30 dias`.
   - Exibir a coluna/badge de referência BRL em `/products`, no modal `Ver detalhes`, na linha principal de `"Minhas cartas e preços"` em `/market` e na fila de `/recommendations` (com trava de aprovação supervisionada).
4. **Etapa 4 — Promoção Controlada de Ambiente (30 min):**
   - Aplicar migrations `0015` e `0016` e importar o catálogo auditável no ambiente alvo após autorização explícita.

---

## N. VEREDITO FINAL (SEÇÕES 16 E 17)

### Respostas Diretas às 20 Perguntas Finais (Seção 16)

1. **O GeekPrice Index existe de verdade?** Sim, no código local (não commitado) e no banco PostgreSQL local isolado `127.0.0.1:55432/geekprice_index_dev`. Não existe ainda no banco comercial Supabase.
2. **Quantas cartas estão precificadas hoje?** **70 impressões** (50 Pokémon e 20 Magic) com 70 observações BRL positivas no banco local `geekprice_index_dev`.
3. **Esses preços vêm do PostgreSQL?** Sim, de `index_cards` + `index_observations` + `index_sources` no PostgreSQL local `geekprice_index_dev`.
4. **Eles aparecem na aba Mercado?** Sim, na aba `"Index BRL"` e dentro do modal `"Index BRL · sugerir preço"` (na aba `"Minhas cartas e preços"`), desde que o servidor esteja conectado ao banco local `geekprice_index_dev`.
5. **Eles aparecem nas cartas cadastradas no estoque?** **Não** na lista de `/products`, **não** no modal `Ver detalhes` de `/products`, e **não** na linha principal de `"Minhas cartas e preços"` em `/market`. Aparecem **somente** se o lojista abrir o modal separado `"Index BRL · sugerir preço"` em `/market`.
6. **O cadastro de produto consulta o GeekPrice Index?** **Não.**
7. **O estoque reconhece a edição correta?** Apenas dentro do modal `"Index BRL · sugerir preço"`, e somente se o nome da edição estiver em inglês idêntico ao da MYP Cards (falha para nomes em português do TCGdex como `"Coleção Básica"` ou nomes sem prefixo de bloco como `"Evolutions"`).
8. **O preço BRL aparece na página do produto?** **Não** (exibe `"Mercado BRL verificado: Sem cotação compatível"`).
9. **O preço BRL alimenta as recomendações?** **Não** na rota/tabela de Recomendações (`/api/recommendations`); alimenta apenas a prévia isolada dentro do modal `"Index BRL · sugerir preço"`.
10. **O Autopilot reconhece essa referência?** **Não** (`/api/autopilot/queue` retorna `marketPrice: null` e `safetyGate: "missing_market_reference"`).
11. **O piso mínimo de margem é respeitado?** **Sim**, comprovado matematicamente e em teste real (`cost = R$ 100,00` com referência `R$ 11,85` resultou em `minimumPrice = R$ 147,06` e `suggestedPrice = R$ 158,90`).
12. **O preço persiste após atualizar a página?** **Sim** dentro do modal `"Index BRL · sugerir preço"` (via `index_inventory_links`), mas **não** no restante da interface.
13. **O isolamento entre lojas funciona?** **Sim**, comprovado com duas organizações sintéticas (`HTTP 404` em qualquer tentativa de leitura/prévia/aprovação cruzada de itens de outra loja).
14. **O que está funcionando completamente?** O armazenamento PostgreSQL do Index (`index_cards`, `index_observations`, `index_sources`, `index_imports`), os 5 endpoints de consulta pública autenticada (`/api/geekprice-index/v1/search`, `price`, `history`, `sources`, `coverage`), a aba `"Index BRL"` em `/market`, a importação CSV auditável com cursor/idempotência e o cálculo de piso financeiro + aprovação/rollback dentro do modal `GeekPriceIndexStock` no banco local.
15. **O que funciona apenas parcialmente?** O vínculo de itens de estoque no modal `"Index BRL · sugerir preço"` (exige seleção manual, falha em nomes traduzidos do TCGdex/Scryfall e depende de flag local `INDEX_ALLOW_UNAPPROVED_REFERENCE_MANUAL`).
16. **O que ainda não funciona?** A exibição de preços do Index na lista e nos detalhes de `/products`, na linha principal de `"Minhas cartas e preços"` em `/market`, no serviço `/api/recommendations`, na fila do Autopilot (`/recommendations`), o vínculo automático ao cadastrar produto, a coleta ao vivo da MYP Cards (bloqueada por Cloudflare 403), o `npm run build` / `npm run typecheck` (quebrados por erro em `scripts/verify-geekprice-index-http.ts:129,132`) e a presença do Index no banco comercial.
17. **Qual é a causa exata de os preços não aparecerem no estoque?** A combinação de duas causas: (1) `src/server/inventory/service.ts` calcula `marketPrice` apenas sobre `external_listings` + `price_observations` e nunca faz JOIN com `index_inventory_links` / `index_cards` / `index_observations`; e (2) o `.env` da aplicação aponta para o banco comercial Supabase, onde as migrations `0015` e `0016` e as 70 cartas não existem.
18. **Quais arquivos precisam ser alterados para corrigir isso?**
    - `scripts/verify-geekprice-index-http.ts` (linhas 129 e 132)
    - `src/db/connection-settings.ts` (linhas 3–7)
    - `src/server/inventory/service.ts` (linhas 17–156, 187–197, 292–360)
    - `src/server/geekprice-index/core.ts` (linhas 22–30)
    - `src/server/geekprice-index/inventory.ts` (linhas 33–37, 66–90)
    - `src/components/product-manager.tsx` e `src/components/product-price-guidance.tsx`
19. **Qual é o risco de habilitar isso em produção?** Sem as travas de revisão manual, haveria risco de precificar cartas usando cotações agregadas sem idioma, acabamento e condição física conhecidos e oriundas de fonte ainda não homologada comercialmente (`commercial_approved = false`). Mantendo a trava de aprovação manual supervisionada e o piso mínimo rentável, o risco financeiro é controlado, restando apenas a homologação jurídica/comercial da fonte de dados.
20. **O projeto está pronto ou não para uso real com preços BRL no estoque?** **NÃO está pronto.**

### Vereditos Obrigatórios (Seção 17)

1. **Estado geral do GeekPrice:** **Funcional com pendências importantes** (suíte principal e segurança multi-tenant funcionam, porém a árvore Git possui 41 alterações não commitadas e `npm run build` / `npm run typecheck` estão quebrados por um script de teste).
2. **Estado do GeekPrice Index:** **Apenas piloto de consulta no Mercado** (disponível somente no banco PostgreSQL local isolado `geekprice_index_dev`, com 70 impressões de 4 buscas base, sem variante física completa e ausente do banco comercial).
3. **Estado da precificação BRL nas cartas cadastradas:** **Em fluxo híbrido incompleto** (não aparece em `/products`, não aparece na linha principal do card em `/market` e não alimenta `/recommendations` nem o Autopilot; funciona apenas dentro de um modal separado aberto manualmente pelo botão `"Index BRL · sugerir preço"` em `/market` quando conectado ao banco local).
