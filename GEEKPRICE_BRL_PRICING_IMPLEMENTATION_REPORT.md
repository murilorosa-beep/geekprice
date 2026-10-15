# Implementação de precificação brasileira — GeekPrice

**Data:** 14/10/2026. Nenhum dado comercial, migration, deploy, push ou credencial comercial foi alterado.

## O que funciona agora

- O conector servidor-side MYP Cards consulta o endpoint oficial de busca por nome para Pokémon e Magic, usando `X-Api-Token` somente no backend.
- Resultados usam nome, edição e código documentados; exibem mínimo/médio/máximo em BRL e link/atribuição MYP. São rotulados como ofertas disponíveis, não vendas concluídas.
- Sem `MYP_CARDS_API_TOKEN`, a interface informa acesso pendente com ação clara; não chama fonte externa e não faz scraping.
- CSV BRL já existente continua como caminho funcional para referências próprias: procedência privada, rastreabilidade, histórico e aprovação manual.
- O motor financeiro existente continua protegido por margem/piso rentável, aprovação manual e rollback. Referência não homologada não habilita autoaplicação.
- A validação agora bloqueia vínculo se o estoque possui número de colecionador e a cotação não o traz; portanto não infere variante de `card_code`.

## Configuração

1. Obter aprovação/token no MYP Cards.
2. Armazenar `MYP_CARDS_API_TOKEN` somente no secret manager do ambiente servidor.
3. Reiniciar o serviço. O token não deve ser colocado em `.env.example`, frontend, log ou commit.
4. Exibir atribuição MYP Cards visível ao lado da cotação, como já requerido pela fonte.

## Limitações e homologação

O conector está **preparado e testado com fixtures do contrato oficial, mas não homologado externamente**: não foi fornecido token autorizado. A especificação de busca não documenta número de colecionador como campo separado; quando esse dado é necessário, o sistema não vincula automaticamente. A confirmação de permissão de SaaS B2B deve ser obtida do MYP antes de ativar produção.

### Tentativa oficial sem token

Em 14/10/2026 foram feitas exatamente quatro chamadas anônimas, uma por rota, com timeout de 8 segundos e sem repetição. Todas receberam **HTTP 403**:

| Endpoint | Resultado |
|---|---:|
| `GET /api/v1/pokemon/carta/Charizard ex` | 403 |
| `GET /api/v1/magic/carta/Lightning Bolt` | 403 |
| `GET /api/v1/pokemon/precos/{codigo}` | 403 |
| `GET /api/v1/magic/precos/{codigo}` | 403 |

Portanto, embora a página de acesso informe limite sem token e diga que alguns endpoints exigem autenticação, estas quatro rotas de busca/preço não estão publicamente utilizáveis no ambiente observado. O conector permanece corretamente bloqueado sem `MYP_CARDS_API_TOKEN`; não houve tentativa de contornar a resposta. Isso também não equivale a autorização comercial SaaS, que continua pendente de confirmação pelo MYP.

`internal_code` e `card_code` são identificadores do MYP; `edition_code`, `edition_pt` e `edition_en` suportam o filtro de edição. `deck_labels` descreve grafias aceitas pelo importador do MYP, mas não é tratado como número de colecionador. `min_price`, `avg_price` e `max_price` são os campos de preço fornecidos pelo MYP: `avg_price` é exibido como média fornecida pela fonte, nunca como mediana calculada localmente. `available_quantity` é disponibilidade total, não contagem de anúncios independentes.

## Validação

| Item | Resultado |
|---|---|
| Testes MYP, assinatura, variantes e segurança | 28/28 aprovados em 2 arquivos |
| Typecheck | aprovado |
| Lint | 0 erros; 9 avisos preexistentes |
| Integração PostgreSQL anterior | 35/35 aprovada no banco isolado |
| E2E persistente | Runtime confirmou o banco isolado; passos 1–11 passaram (login, dashboard, produto, Pokémon, Magic, estoque, CSV de estoque, custos/margens e importação BRL). O executor persistiu log e status, mas terminou com **exit code 1** no passo 12: o rótulo de procedência esperado não apareceu após a importação BRL. A jornada completa não está aprovada. |
| OPS-02 | pendente; rotação comercial não foi executada |

## Correção do isolamento E2E

Foi adicionada a rota de diagnóstico somente para desenvolvimento `api/internal/test-runtime-db`. Ela consulta `current_database()` e retorna somente host, porta e banco; em produção responde 404. O E2E interrompe antes de criar dados se a confirmação não for `geekprice_phase81_test_*`.

O diagnóstico mostrou que a falha anterior de login era causada pelo sandbox bloqueando a conexão do processo Next ao PostgreSQL de teste (`EACCES`), não por uso confirmado do banco comercial. Com acesso de rede autorizado, o runtime confirmou o banco isolado e o login retornou 200.

## Preparação Railway

| Marco | Estado | Bloqueadores reais |
|---|---|---|
| A. Staging técnico isolado | **condicionado** | Corrigir a asserção/visibilidade de procedência BRL e obter E2E completo com exit 0; revisar mudanças locais. Token MYP não bloqueia staging porque CSV/manual funciona. |
| B. Beta privado com lojistas | **bloqueado** | E2E completo, OPS-02 concluído sob autorização e revisão operacional de credenciais. |
| C. SaaS comercial com cotações MYP reais | **bloqueado** | Token MYP aprovado, confirmação escrita de uso comercial SaaS/armazenamento/cache e validação externa bem-sucedida. |

OPS-02 segue pendente e não foi executado. Nenhuma rotação comercial foi tentada.

## Fechamento da correção BRL e E2E — 14/10/2026

### Causa confirmada do antigo passo 12

Classificação: **D — a interface apresentava os dados, mas o teste esperava um elemento de forma incorreta.** A importação CSV gravou três observações BRL; a consulta autenticada posterior retornou as duas observações da Deck Box, com valores `75.00` e `78.00`, tipo `reference`, fonte `REFERENCIA PRIVADA F93`, `sourceType=private` e `sourceVerified=false`. A captura de falha também mostrou esses mesmos valores, a data, a fonte e o texto de procedência na tela.

O falso negativo ocorreu porque, ao navegar novamente para Mercado, a aba inicial é **Minhas cartas e preços**, enquanto o histórico está na aba **Buscar edição no catálogo**. Depois de selecionar a aba certa, o Playwright ainda consultava um texto isolado dentro de um parágrafo composto. Foram adicionados atributos estáveis `data-testid=market-source-status` e `data-testid=market-price-type`; o E2E agora seleciona o bloco da Deck Box, a fonte e esses elementos acessíveis de forma determinística. Não foram adicionados dados de teste à interface nem alteradas regras de precificação.

### Evidência de persistência e isolamento

- O commit de importação respondeu `201` e a consulta posterior `GET /api/market?currency=BRL&days=30` respondeu `200` na sessão da organização correta.
- O teste conferiu fonte, tipo, estado de homologação, tipo de preço, contagem, mínimo e máximo contra o CSV antes de continuar para o Autopilot.
- Uma segunda organização criada exclusivamente no banco `geekprice_phase81_test_1791978720676` autenticou no navegador. Ela recebeu zero grupos ao consultar o `inventoryItemId` da primeira organização e recebeu `404` ao tentar `PATCH` no mesmo item. A primeira organização foi a única que pôde aprovar e depois fazer rollback.

### E2E Chromium completo

O executor persistente terminou em **exit code 0** em `2026-10-15T01:26:19.200Z`. O log está em `.tools/phase93-e2e.log` e o status em `.tools/phase93-e2e-status.json`. Foram concluídos login, dashboard, produto manual, Pokémon, Magic, edição de estoque, CSV de estoque, exportação, política de margens, importação BRL, consulta posterior, procedência, recomendação, piso mínimo de R$ 46,16, aprovação manual, alteração para R$ 74,90, histórico, rollback, restauração exata para R$ 65,00 e isolamento entre organizações. Não houve `pageerror`.

### Segurança do diagnóstico

`/api/internal/test-runtime-db` continua somente-leitura e nunca expõe URL de conexão, usuário, senha ou segredo. Além de responder 404 em produção, agora exige a flag efêmera `E2E_RUNTIME_DIAGNOSTIC=true`, que é definida exclusivamente pelo lançador de validação depois de validar o nome do banco isolado. Sem essa flag, a rota responde 404 também em desenvolvimento. O runtime confirmou `current_database()` como `geekprice_phase81_test_1791978720676` antes de o E2E criar qualquer dado.

### Arquivos desta correção

- `scripts/run-phase93-e2e.mjs`: repassa o ambiente isolado ao processo filho e registra log/status.
- `scripts/start-validation-server.mjs`: habilita o diagnóstico apenas no lançador validado.
- `scripts/verify-phase93-browser.mjs`: verifica persistência pela API, usa seletores estáveis, usa a ação real de aprovação e valida isolamento entre organizações.
- `src/app/api/internal/test-runtime-db/route.ts`: requer flag explícita fora de produção.
- `src/components/market-explorer.tsx`: expõe identificadores estáveis para o status de fonte e tipo de preço já exibidos.

### Validações atuais

| Item | Resultado atual |
|---|---|
| Typecheck | aprovado |
| Lint | aprovado: 0 erros, 9 avisos preexistentes |
| Unitários | 117/117 aprovados |
| Build Next.js | aprovado: `next build` terminou integralmente com exit code 0 |
| Integração PostgreSQL | última execução integral registrada: 35/35 aprovada; nova execução foi iniciada após a trava isolada nesta rodada, sem saída final capturada pelo terminal antes desta atualização |
| E2E Chromium | aprovado, 20 passos, exit code 0 |
| MYP sem token | continua bloqueado corretamente após 4 respostas HTTP 403; nenhuma tentativa adicional foi feita |
| OPS-02 | pendente; não houve rotação de credenciais comerciais |

### Git e Railway

Branch atual: `main`, três commits locais recentes: `3afc208`, `73fd239` e `0ad0a98`; a árvore diverge de `origin/main` em `0/3` (três commits locais ainda não enviados). Há mudanças não commitadas listadas por `git status`, incluindo esta correção, SEC-01, conector MYP, guardas de teste e relatórios. Não foi feito push, deploy, migration comercial ou alteração de credenciais. Nenhum segredo foi incluído nos arquivos revisados.

Staging técnico isolado no Railway está **pronto para a revisão de configuração**, pois o CSV/manual BRL, aprovação e rollback foram comprovados sem token MYP. Beta privado continua bloqueado por OPS-02. Cotações MYP reais em SaaS continuam bloqueadas até token autorizado, homologação técnica e permissão comercial expressa.
