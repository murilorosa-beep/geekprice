# GEEKPRICE — RELATÓRIO DEFINITIVO DE CORREÇÃO E INTEGRAÇÃO DO GEEKPRICE INDEX (BRL) AO ESTOQUE, MERCADO E AUTOPILOT

**Data da validação:** 16 de outubro de 2026  
**Banco isolado validado:** `postgresql://geekprice@127.0.0.1:55432/geekprice_index_dev` (PostgreSQL 17.6 local)  
**Banco comercial Supabase:** Não modificado (nenhuma migration ou escrita executada contra o banco comercial)

---

## 1. Problemas Originais Confirmados e Corrigidos

### 1.1. "Preços em BR nunca aparecem no Autopilot" (`/recommendations`)
- **Causa raiz:**
  1. `listInventory()`, `listAllInventory()` e `listInventoryChunk()` em `src/server/inventory/service.ts` consultavam apenas a tabela legada `product_market_references` (`marketPrice`) e ignoravam `index_inventory_links` + `index_observations`.
  2. Mesmo após expor `indicativeMarketReference` no inventário, `evaluateAutopilotItemChunk()` em `src/server/autopilot/service.ts` passava apenas `marketPrice: item.marketPrice` (`null`) para `calculateRecommendation()` e ignorava `item.indicativeMarketReference`. Por isso, a tabela principal do **Autopilot** (`src/components/autopilot-view.tsx`) continuava exibindo `R$ 3.967,90 · Simulação por custo; não aplicável` e `Sem cotação BRL`.
- **Correção definitiva:**
  1. `src/server/geekprice-index/references.ts` (`attachIndexReferences`) anexa `indicativeMarketReference` (preço BRL, fonte, URL, data, nível de confiança e flag `indicativeOnly: true`) e `verifiedMarketPrice` em lote (`SELECT DISTINCT ON`), vinculando automaticamente itens existentes que possuam uma única impressão exata (`exact.length === 1`) sem ambiguidade.
  2. `src/server/autopilot/service.ts` (`evaluateAutopilotItemChunk`) utiliza `indicativeMarketReference.price` (quando não expirada) no motor `calculateRecommendation` com `hasUnverifiedMarketReference: true`, mantendo `itemView.marketPrice = null` e expondo `itemView.indicativeMarketReference`. Assim:
     - O Autopilot calcula e exibe a sugestão real baseada no Index BRL (`R$ 5.024,90` para `Charizard Base Set 004/102`, com referência `Index BRL: R$ 5.180,43 (MYP Cards)`);
     - O item recebe `safetyStatus = "suspicious_flagged"` e `safetyGate = "unverified_market_reference"` (`Index BRL · revisão manual`), permanecendo **fora** de `queue.safe` (`queue.safe.length === 0`), impedindo qualquer aplicação automática em lote sem confirmação humana de variante;
     - Na tela `/recommendations`, tanto o painel `Index BRL · revisão supervisionada` (`src/components/index-supervised-recommendations.tsx`) quanto a tabela e o modal de revisão do `AutopilotView` (`src/components/autopilot-view.tsx`) exibem o preço BRL e permitem abrir o comparador supervisionado (`GeekPriceIndexStock`) para aprovar manualmente ou executar rollback.

### 1.2. "No Mercado dá Erro Interno" (`/market`)
- **Causa raiz:**
  1. Em `src/server/market/tcgdex.ts`, ao selecionar ou associar uma carta no catálogo do Mercado cuja edição existe apenas em inglês na TCGdex (ex.: `base1-4` quando o seletor de idioma estava em `pt-br`), `https://api.tcgdex.net/v2/pt-br/cards/base1-4` retornava HTTP `404`. O conector lançava `Error("TCGdex request failed: 404")`, que caía no fallback genérico de `authErrorResponse` (`src/server/auth/context.ts`) como HTTP `500 { error: "Erro interno." }`.
  2. Além disso, se o ambiente estivesse conectado a um banco onde as migrations `0015`/`0016` (`index_cards`, `index_inventory_links`) ainda não tivessem sido aplicadas, as rotas `/api/geekprice-index/v1/*` lançavam erro SQL de relação inexistente (`42P01`), resultando também em `500 "Erro interno."`.
- **Correção definitiva:**
  1. Em `src/server/market/tcgdex.ts`, `search()` trata `404` no catálogo localizado como lista vazia e faz fallback automático para `en`; `getCard()` faz retry automático em `en` quando `pt-br` retorna `404`.
  2. Em `src/components/market-explorer.tsx`, a seleção e a associação enviam o idioma real retornado pelo candidato (`c.language || language`).
  3. Em `src/server/auth/context.ts`, erros de conectores externos com status HTTP (`404` / `5xx`) retornam mensagens claras (`404` / `502`) em vez de `500 "Erro interno."`.
  4. Em `src/server/geekprice-index/references.ts`, `src/server/geekprice-index/service.ts` e `src/server/geekprice-index/inventory.ts`, quando `indexAvailable()` detecta que as tabelas `index_*` ainda não existem no banco conectado, o serviço utiliza em memória o snapshot auditado de 70 cartas (`data/geekprice-index/mypcards-pilot.tsv`), evitando qualquer erro `500` e exibindo as referências BRL indicativas normalmente.

### 1.3. Build TypeScript (`TS18046`) e Configuração de TLS Local vs. Produção
- **Causa raiz:**
  1. `scripts/verify-geekprice-index-http.ts` consumia `await response.json()` como `unknown` sob `strict: true`, gerando 16 erros `TS18046`.
  2. `src/db/connection-settings.ts` carregava `supabase-prod-ca.crt` mesmo para conexões locais (`127.0.0.1` / `localhost`), exigindo workarounds manuais.
- **Correção definitiva:**
  1. `scripts/verify-geekprice-index-http.ts` valida todas as respostas HTTP com contratos `zod` estritos.
  2. `src/db/connection-settings.ts` retorna `{ ssl: false }` exclusivamente para hosts locais (`localhost`, `127.0.0.1`, `::1`) quando `APP_ENV !== "production"`, preservando `rejectUnauthorized: true`, CA e verificação de hostname para qualquer conexão remota ou ambiente de produção.

### 1.4. Preservação de Identificadores e Correspondência Canônica de Edições no Cadastro
- **Causa raiz:**
  1. `createInventoryItem()` (`src/server/inventory/service.ts`) descartava `catalogSource` e `canonicalId` e não executava `linkInventoryVariantToIndex()`.
  2. `registerSmartCatalogCard()` (`src/server/smart-registration/service.ts`) gravava o nome da coleção em português (`Coleção Básica`) sem equivalência com `Base Set` e sem acionar o vínculo com o Index.
- **Correção definitiva:**
  1. `src/server/inventory/schemas.ts` e `src/server/inventory/service.ts` preservam `catalogSource` e `canonicalId` em `product_variants` e chamam `linkInventoryVariantToIndex()` dentro da transação de criação.
  2. `src/server/smart-registration/service.ts` chama `linkInventoryVariantToIndex()` ao cadastrar ou atualizar cartas via Catálogo (`TCGdex` e `Scryfall`).
  3. `src/server/geekprice-index/core.ts` (`printingSetKey` e `matchStockPrinting`) implementa equivalências explícitas e testadas para `Base Set` / `Coleção Básica` (`base1`/`bs`), `Base Set 2` (`base4`/`b2`), `Evolutions` / `XY 12: Evolutions` / `Evoluções` (`xy12`/`evo`), `Vivid Voltage` / `Voltagem Vívida` (`swsh4`/`viv`), `Revised Edition` / `Revised` (`3ed`/`rev`) e `Magic 2010` (`m10`), bloqueando correspondências aproximadas (fuzzy) de nome ou denominadores conflitantes (`004/102` vs `004/130`).

---

## 2. Arquivos Modificados e Criados

| Arquivo | Responsabilidade |
|---|---|
| `src/db/connection-settings.ts` | Seleção segura de TLS (`ssl: false` para PostgreSQL local fora de produção; TLS + CA estrito para conexões remotas/produção). |
| `src/db/connection-settings.test.ts` | Testes unitários da política de conexão local vs. remota/produção. |
| `src/lib/index-reference.ts` | Contrato compartilhado `IndicativeMarketReference` (`price`, `source`, `sourceUrl`, `observedAt`, `confidence`, `score`, `stale`, `indicativeOnly`, `autoApplyEligible: false`). |
| `src/server/geekprice-index/core.ts` | Equivalências canônicas de coleções (`printingSetKey`) e correspondência determinística de impressão (`matchStockPrinting`). |
| `src/server/geekprice-index/printing.test.ts` | Testes unitários das equivalências (`Coleção Básica`/`Base Set`, `Evolutions`/`XY 12: Evolutions`, `Revised Edition`/`Revised`) e bloqueio de falsos positivos. |
| `src/server/geekprice-index/references.ts` | Camada compartilhada sem N+1 (`attachIndexReferences`, `linkInventoryVariantToIndex`, `indexAvailable`, `getPilotFallbackQuotes`). |
| `src/server/geekprice-index/service.ts` | Consultas do GeekPrice Index com fallback resiliente para o snapshot piloto caso as tabelas `index_*` não estejam presentes. |
| `src/server/geekprice-index/inventory.ts` | Match de estoque com auto-vínculo para candidato exato único (`exactCount === 1`), simulação financeira supervisionada e suporte a piloto local. |
| `src/server/inventory/schemas.ts` | Aceitação de `catalogSource` e `canonicalId` no cadastro de estoque. |
| `src/server/inventory/service.ts` | Preservação de `catalogSource`/`canonicalId` e resolução de `indicativeMarketReference` e `verifiedMarketPrice` em `listInventory`, `listAllInventory` e `listInventoryChunk`. |
| `src/server/smart-registration/service.ts` | Vínculo automático seguro ao cadastrar cartas via Catálogo (`TCGdex` e `Scryfall`). |
| `src/server/recommendations/service.ts` | Inclusão de referências indicativas do Index nas recomendações supervisionadas (`status: "indicative_reference"`, `safetyStatus: "suspicious_flagged"`). |
| `src/server/autopilot/service.ts` | Cálculo de sugestão supervisionada no Autopilot usando `indicativeMarketReference` com `hasUnverifiedMarketReference: true` (mantendo `queue.safe` bloqueado). |
| `src/server/market/tcgdex.ts` | Fallback automático `pt-br` → `en` em `search()` e `getCard()` quando uma carta da TCGdex não possui tradução localizada (`404`). |
| `src/server/market/tcgdex.test.ts` | Teste unitário cobrindo o fallback `pt-br` → `en` na TCGdex. |
| `src/server/auth/context.ts` | Tratamento de erros HTTP de conectores externos em `authErrorResponse` para evitar `500 "Erro interno."`. |
| `src/components/index-reference-summary.tsx` | Exibição padronizada de preço BRL indicativo, fonte, data, confiança e aviso de variante. |
| `src/components/product-manager.tsx` | Exibição da referência BRL indicativa na lista de produtos e no modal de detalhes do produto, com botão direto para `GeekPriceIndexStock`. |
| `src/components/product-price-guidance.tsx` | Orientação de preço considerando referência verificada e referência indicativa do Index. |
| `src/components/market-my-cards.tsx` | Exibição de `IndexReferenceSummary` na aba `Minhas cartas e preços` do Mercado. |
| `src/components/market-explorer.tsx` | Preservação do idioma do card selecionado ao consultar/associar no Mercado. |
| `src/components/index-supervised-recommendations.tsx` | Painel de revisão supervisionada do Index em `/recommendations`. |
| `src/components/autopilot-view.tsx` | Exibição de `Index BRL: R$ ...` e `Index BRL · revisão manual` na tabela e no modal de detalhes do Autopilot, integrado ao modal `GeekPriceIndexStock`. |
| `src/components/recommendations-view.tsx` | Rótulo de status `indicative_reference` (`Index BRL (indicativa)`). |
| `tests/integration/index-inventory.integration.test.ts` | Teste de integração cobrindo os cenários obrigatórios no PostgreSQL isolado `geekprice_index_dev`. |
| `scripts/verify-geekprice-index-http.ts` | Suite E2E HTTP + Chromium validada com Zod (`TS18046` corrigido). |
| `scripts/verify-index-stock-browser.ts` | Suite E2E Chromium validando o fluxo completo do lojista ponta a ponta (`Catálogo → Estoque → Produtos → Aprovação → Persistência → Rollback → Autopilot → Mercado`). |
| `scripts/rehearse-index-deployment.ts` | Ensaio automatizado de implantação (`pg_dump` / `pg_restore`, migrations `0015` e `0016`, seed idempotente em 2 passagens). |

---

## 3. Resultado das Validações e Testes Automatizados

Todos os comandos abaixo foram executados e finalizaram com **`exit code 0`**:

1. **Typecheck (`npm run typecheck`):**
   - `tsc --noEmit` → **0 erros** (exit code `0`).
2. **Testes Unitários (`npm test`):**
   - `34` arquivos de teste aprovados, **`154` testes aprovados** (exit code `0`).
3. **Integridade de Migrations (`npm run db:check`):**
   - `17` snapshots verificados (`0000` a `0016`), `chainValid: true`, `schemaDrift: []`, `driftStatements: 0` (exit code `0`).
4. **Testes de Integração no Banco Isolado (`tests/integration/index-inventory.integration.test.ts`):**
   - Executado contra `postgresql://geekprice@127.0.0.1:55432/geekprice_index_dev` (`2` testes aprovados):
     - `Charizard Base Set 004/102` → vinculado automaticamente a `pokemon_bs_004/102`, `indicativeMarketReference.price = 5180.43`, `verifiedMarketPrice = null`, `marketPrice = null`.
     - `Charizard Base Set 2 004/130` → vinculado automaticamente a `pokemon_b2_004/130`, `indicativeMarketReference.price = 4645.00` (sem colisão com `Base Set`).
     - `Charizard Coleção Básica nº 4` (`catalogSource: "tcgdex"`, `canonicalId: "base1-4"`) → vinculado automaticamente a `pokemon_bs_004/102`, `indicativeMarketReference.price = 5180.43`, sugestão supervisionada `R$ 5.024,90`.
     - `Lightning Bolt Magic 2010 146` (`catalogSource: "scryfall"`, `canonicalId: "m10-146"`) → vinculado automaticamente a `magic_m10_0146`, `indicativeMarketReference.price = 11.85`.
     - `Bulbasaur Base Set 44` (sem cotação no Index) → `indicativeMarketReference = null`.
     - `Charizard Base Set 4` com `finish: "reverse"` → `marketPrice = null`, bloqueado para precificação automática.
     - Isolamento multi-tenant (`orgA` vs `orgB`) → `orgB` vê a referência pública do Index em sua própria carta sem acessar custo, preço, SKU ou histórico de `orgA` (`getIndexPricingPreview(orgB, base.id) === null`).
     - Idempotência de `refreshRecommendations(orgA)` → duas execuções consecutivas não duplicam linhas em `recommendations`.
     - Bloqueio do Autopilot automático → `queue.safe.some(item => item.id === base.id) === false`, enquanto `queue.flagged` contém o item com `suggestedPrice: 5024.9`, `safetyGate: "unverified_market_reference"` e `indicativeMarketReference.price: 5180.43`.
     - Aprovação manual e rollback transacional → exige `confirmedVariant: true`, atualiza `inventory_items.price` de `5000.00` para `5024.90`, registra `price_change_batches` e `price_change_history`, bloqueia dupla aprovação sem mudança e restaura `5000.00` no rollback.
     - Ambiguidade (`Ambiguous Test` com 2 impressões candidatas) → zero links criados automaticamente (`status: "ambiguous"`).
5. **Build de Produção (`npm run build`):**
   - `next build --webpack` compilado e gerado com sucesso (**exit code `0`**).

---

## 4. Validação Real no Navegador (`1440×1000` / `1440×1100`)

Com o servidor Next.js rodando em `http://127.0.0.1:3199` conectado a `geekprice_index_dev`, foram executados os dois scripts Playwright em Chromium real:

### 4.1. `scripts/verify-geekprice-index-http.ts`
- **Resultado:**
  ```json
  {
    "target": { "host": "127.0.0.1", "database": "geekprice_index_dev" },
    "unauthenticated": 401,
    "cards": 70,
    "priced": 70,
    "searched": 20,
    "askingMin": "1500.00",
    "source": "MYP Cards",
    "matchedInventoryItems": 1,
    "approved": true,
    "rolledBack": true,
    "adminImportPreviewAndCommit": true,
    "chromium": "passed"
  }
  ```
- **Capturas geradas:**
  - `.tools/geekprice-index-market-integrated.png`
  - `.tools/geekprice-index-stock-pricing.png`
  - `.tools/geekprice-index-admin-preview.png`

### 4.2. `scripts/verify-index-stock-browser.ts`
Validou no navegador a jornada completa solicitada:
1. Abriu `/catalog`, pesquisou `Charizard` nº `4` ao vivo na API TCGdex e selecionou `base1-4` (`Coleção Básica` / `Base Set`).
2. Cadastrou a carta no estoque com custo `R$ 2.500,00` e preço atual `R$ 5.000,00` (`POST /api/smart-registration/card` → HTTP `201`).
3. Confirmou no PostgreSQL que `product_variants.canonical_id = "base1-4"`, `catalog_source = "tcgdex"` e que o vínculo em `index_inventory_links` foi criado automaticamente no cadastro.
4. Abriu `/products`, verificou a exibição imediata de `R$ 5.180,43` na tabela do estoque, executou `page.reload()` e confirmou que a cotação permaneceu visível após recarregar a página.
5. Abriu o detalhe de `Charizard` e o modal `Comparar e sugerir preço`, verificando:
   - Referência BRL: `R$ 5.180,43` (`MYP Cards`)
   - Preço mínimo rentável: `R$ 3.676,48`
   - Sugestão supervisionada: `R$ 5.024,90`
6. Confirmou manualmente a variante (checkbox), aprovou o preço para `R$ 5.024,90`, recarregou `/products` e verificou a persistência no PostgreSQL (`5024.90`) e na tabela.
7. Reabriu o histórico do item, clicou em `Reverter` (rollback) e confirmou a restauração do preço `R$ 5.000,00` na interface e no PostgreSQL.
8. Abriu `/recommendations` (Autopilot) e comprovou que **tanto** a seção `Index BRL · revisão supervisionada` **quanto** a tabela principal do Autopilot (`Sugestões de preço`) exibem `R$ 5.024,90`, `Index BRL: R$ 5.180,43 (MYP Cards)` e `Index BRL · revisão manual`.
9. Abriu `/market` → `Minhas cartas e preços` e comprovou a exibição de `Index BRL: R$ 5.180,43`.
- **Resultado salvo em `.tools/index-stock-browser-result.json`:**
  ```json
  {
    "target": { "host": "127.0.0.1", "database": "geekprice_index_dev" },
    "catalog": "TCGdex live",
    "canonicalId": "base1-4",
    "referenceBrl": 5180.43,
    "suggestedPrice": 5024.9,
    "minimumPrice": 3676.48,
    "autoLinked": true,
    "reloaded": true,
    "approvedInBrowser": true,
    "persistedPostgres": true,
    "history": true,
    "rollbackInBrowser": true,
    "recommendations": true,
    "autopilotQueueBrl": true,
    "market": true
  }
  ```
- **Capturas geradas:**
  - `.tools/index-stock-before-approval.png`
  - `.tools/index-stock-after-rollback.png`
  - `.tools/index-supervised-recommendations.png`
- **Limpeza do banco isolado verificada após os testes:** `index_cards = 70`, `index_observations = 70`, `index_sources = 1`, `organizations = 0`, `products = 0`, `inventory_items = 0`, `index_inventory_links = 0`.

---

## 5. Plano e Ensaio de Implantação Segura no Supabase

O script `scripts/rehearse-index-deployment.ts` foi executado localmente para ensaiar o procedimento completo de backup, aplicação das migrations `0015_yellow_zodiak.sql` e `0016_fancy_lockjaw.sql` e seed idempotente das 70 cartas, registrando o resultado em `.tools/index-deployment-rehearsal.json`:

- **Backup e restauração verificados:** `pg_dump --format=custom` gerou `.tools/geekprice_index_dev_pre_deploy.dump` (`51.908` bytes), validado com `pg_restore` em banco descartável `geekprice_index_rehearsal`.
- **Idempotência comprovada:** Duas execuções consecutivas do seed mantiveram exatamente `70` registros em `index_cards` (`50` Pokémon e `20` Magic), `70` observações em `index_observations` e `0` alterações em `inventory_items`.

### Passos para promover ao banco comercial Supabase (quando autorizado):
1. **Gerar backup pré-migration:**
   ```powershell
   pg_dump --format=custom --no-owner --no-acl --file="backup_pre_0015_0016.dump" "$env:SUPABASE_DIRECT_URL"
   ```
2. **Aplicar migrations pendentes (`0014`, `0015`, `0016`):**
   ```powershell
   npm run db:migrate
   ```
3. **Importar o seed piloto auditado (70 impressões BRL):**
   ```powershell
   npx tsx scripts/seed-geekprice-index.ts
   ```
4. **Verificar contagens pós-seed (somente leitura):**
   - `index_sources`: `1` (`mypcards_public_pilot`)
   - `index_cards`: `70` (`50` Pokémon, `20` Magic)
   - `index_observations`: `70`
5. **Procedimento de rollback de banco (caso necessário):**
   - As tabelas `index_*` (`index_sources`, `index_cards`, `index_observations`, `index_runs`, `index_imports`, `index_inventory_links`) são isoladas e não alteram colunas existentes de `inventory_items` ou `products`. Caso seja necessário reverter o schema do Index sem afetar o estoque das lojas, basta remover as tabelas `index_*` ou restaurar o dump `backup_pre_0015_0016.dump`.

---

## 6. Status da Pendência Operacional `OPS-02` e Ações Externas

- **`OPS-02` (Credenciais comerciais em `.env` local):** Permanece aberta como pendência exclusivamente operacional/externa. Nenhuma credencial comercial foi exposta no código ou nos relatórios, e nenhuma alteração foi feita no Supabase comercial ou nos provedores externos (Mercado Pago / Google / Resend / Cloudflare).
- **O que depende de ação externa do usuário:**
  1. Executar as migrations `0015` e `0016` + `scripts/seed-geekprice-index.ts` no banco Supabase comercial quando desejar persistir as tabelas `index_*` na nuvem (nota: mesmo antes da migration no Supabase, o fallback em memória de `getPilotFallbackQuotes()` já garante que as 70 cartas piloto exibam preços BRL indicativos sem erro `500`).
  2. Rotacionar as chaves de `.env` nos painéis dos provedores externos (`OPS-02`) antes do lançamento comercial público.
