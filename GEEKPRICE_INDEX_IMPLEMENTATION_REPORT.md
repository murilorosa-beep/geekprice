# GeekPrice Index — relatório de implementação

Data: 15/10/2026. Estado: piloto de 70 impressões **carregado e consultado em PostgreSQL local isolado** (`127.0.0.1:55432/geekprice_index_dev`). Não houve migration, seed, push, deploy ou tarefa recorrente em ambiente comercial.

## 1. Arquitetura

O índice usa tabelas globais próprias (`index_cards`, `index_sources`, `index_observations`, `index_runs`) sem modificar o estoque ou as cotações privadas das organizações. Uma impressão é identificada por jogo, origem do catálogo e código canônico. A coleção, código da edição e número de colecionador são armazenados separadamente. Idioma, acabamento e condição ficam nulos quando a fonte não os informa. A API consulta somente PostgreSQL. O worker separado consulta a fonte apenas quando executado manualmente.

A migration gerada é `drizzle/0015_yellow_zodiak.sql`. As quatro tabelas têm RLS habilitado, sem políticas para clientes diretos. O acesso passa pelos handlers autenticados do servidor. `index_observations.fingerprint` é único; uma consulta repetida atualiza `last_seen_at` e não fabrica uma nova observação histórica.

## 2. Fontes investigadas e código aberto

- [MYP Cards — acesso oficial à API](https://mypcards.com/acesso-api): API pública sem token, limite informado de 10 requisições/minuto, 60 com token, atribuição obrigatória onde o dado aparece. **Fonte usada** no piloto pelo navegador, sem token. Seus valores são mínimo, média e máximo de anúncios em BRL; não são vendas concluídas.
- [LigaPrice, repositório e README](https://github.com/davydmaker/liga-price-extension): extensão Chrome MIT que pesquisa páginas da Liga e exporta CSV; usa edição para distinguir resultados. O [extrator](https://github.com/davydmaker/liga-price-extension/blob/main/js/priceExtractor.js) interpreta campos de mínimo, média e máximo. O [coletor](https://github.com/davydmaker/liga-price-extension/blob/main/js/scraper.js) usa `fetch`, timeout e fila de retentativa para HTTP 429. O README avisa que o uso pode conflitar com os termos das lojas. Nenhum código foi copiado; a licença MIT do software não concede direitos sobre dados da Liga.
- Liga Pokémon e Liga Magic: conectores experimentais já existiam no projeto, mas a coleta comercial permanece desabilitada. Não foram usados no piloto.
- TCGdex e Scryfall: catálogos úteis para identificação, sem preço brasileiro substituto. Não se fez conversão USD→BRL.
- Outras APIs comerciais e plataformas brasileiras: identificadas na pesquisa, mas não utilizadas por falta de acesso/contrato ou de validação de direitos para armazenamento.

## 3. Piloto real

Quatro consultas públicas ao MYP Cards foram realizadas: `pokemon/carta/Charizard`, `pokemon/carta/Pikachu`, `magic/carta/Lightning Bolt` e `magic/carta/Counterspell`. As respostas tinham 63, 241, 54 e 64 registros brutos, respectivamente. O arquivo [mypcards-pilot.tsv](data/geekprice-index/mypcards-pilot.tsv) preserva 50 impressões Pokémon e 20 Magic distintas com preço positivo, URL do produto, código, edição e quantidade anunciada. O [manifesto](data/geekprice-index/manifest.json) registra a janela de observação de 15/10/2026. Nenhum valor foi gerado para preencher lacunas.

| Métrica do conjunto selecionado | Valor |
| --- | ---: |
| Impressões pesquisadas/selecionadas | 70 |
| Com preço BRL observável | 70 |
| Correspondência exata pelo código nativo MYP | 70 |
| Correspondência cruzada TCGdex/Scryfall homologada | 0 |
| Ambíguas no conjunto selecionado | 0 |
| Sem preço no conjunto selecionado | 0 |
| Erros nas quatro chamadas públicas | 0 |
| Cobertura do conjunto selecionado | 100% |

Essa cobertura é do **conjunto escolhido**, não do catálogo completo. A API também retornou cartas sem preço e códigos repetidos; elas foram excluídas do conjunto inicial. A coleta foi feita em poucos minutos, mas não houve cronômetro instrumentado, portanto não há duração exata auditável.

Exemplos observados em 15/10/2026:

- [Charizard, Base Set, 004/102](https://mypcards.com/pokemon/produto/33698/charizard): mínimo R$ 1.500,00; média **informada pelo MYP** R$ 5.180,43; máximo R$ 25.000,00.
- [Charizard, Base Set 2, 004/130](https://mypcards.com/pokemon/produto/33004/charizard): mínimo R$ 2.790,00; média da fonte R$ 4.645,00; máximo R$ 6.500,00. É outra impressão e não compartilha cotação com a anterior.
- [Lightning Bolt, Magic 2010, 0146](https://mypcards.com/magic/produto/21004/raio): mínimo R$ 9,99; média da fonte R$ 11,85; máximo R$ 14,00.

Os preços são um retrato datado. `provider_average` nunca é rotulado como mediana. Média e mediana calculadas, assim como venda concluída, permanecem nulas porque o provedor não forneceu observações individuais suficientes.

## 4. Banco, API e atualização

As colunas monetárias são `numeric(14,2)` e o código usa Decimal.js para validar BRL. Há índices por jogo/edição/número, nome, fonte e data. A origem, URL, identificador externo, tipo de preço e datas são conservados em cada observação. A fonte é global; nenhuma observação do índice tem organização dona e nenhuma tabela de inventário é alterada.

Endpoints autenticados, limitados a 120 consultas/minuto por organização e com cache HTTP privado de 30 segundos:

| Rota | Resposta |
| --- | --- |
| `GET /api/geekprice-index/v1/search?q=...&game=pokemon` | Impressões cadastradas |
| `GET /api/geekprice-index/v1/cards/:id/price` | Resumo BRL, origem, data, qualidade e estado de atualização |
| `GET /api/geekprice-index/v1/cards/:id/history` | Observações históricas |
| `GET /api/geekprice-index/v1/coverage` | Cobertura e erros |
| `GET /api/geekprice-index/v1/sources` | Fontes e última disponibilidade |

O script `scripts/seed-geekprice-index.ts` valida e carrega o retrato de 70 linhas. `scripts/refresh-geekprice-index.ts --approved` consulta os quatro grupos por lotes manuais, com timeout de 10 segundos, retentativas limitadas, espera conservadora sem token, checkpoint em `index_runs` e interrupção em 401/403/429. O modo `--offline-pilot` reprocessa apenas o retrato datado para validar lote e retomada, sem apresentar os dados como nova coleta. Ambos recusam banco comercial e exigem `geekprice_index_dev` local ou o padrão local de teste isolado. Não há agendamento ativo. O worker atual é serial e limitado ao conjunto do piloto.

As migrations 0000–0015 foram aplicadas no banco local isolado. O seed gravou 50 Pokémon e 20 Magic, com 70 observações. `scripts/verify-geekprice-index.ts` consultou Charizard Base Set via o serviço de leitura PostgreSQL, confirmou R$ 1.500,00 de mínimo, R$ 5.180,43 de média da fonte, URL/atribuição e uma linha de histórico. Regravar a mesma cotação preservou 70 observações.

Uma tentativa de atualização direta pelo worker recebeu HTTP 403 do MYP Cards e foi interrompida, sem contornar o bloqueio. O erro ficou registrado em `index_runs`. O retrato já obtido pelo navegador foi então processado em dois lotes (`--offline-pilot --max-groups=1` e depois `--max-groups=3`): o cursor passou de 1 a 4, status `completed`, 70 impressões processadas e 70 observações finais. Isso valida checkpoint e deduplicação, **não valida atualização de preços ao vivo pelo backend**. Um token/acesso aceito para execução de servidor ou fonte alternativa autorizada ainda é necessário para atualização periódica real.

## 5. Interface, qualidade e proteção financeira

A página de Mercado contém uma busca do Index sobre o banco local; mostra coleção, número, mínimo anunciado, média da fonte, máximo, atribuição MYP Cards, data e estado de atualização. O painel `geekprice-index-admin` é restrito à allowlist de administradores da plataforma e mostra cobertura, observações, fontes e erros.

A qualidade considera correspondência, idade, disponibilidade e número de fontes, com teto de 0,52 para uma fonte isolada. Idioma, acabamento e condição ausentes são explicitados. `autoApplyEligible` é sempre `false` neste estágio. O Index não alimenta automaticamente as observações homologadas usadas pelo Autopilot; aprovação manual e rollback existentes permanecem intactos.

O painel administrativo ainda não oferece upload/validação/prévia de CSV, revisão interativa de ambiguidades, disparo de lotes ou exportação. Há scripts manuais para a carga e atualização. A associação automática entre códigos MYP e variantes TCGdex/Scryfall também não foi homologada. Por isso referências do Index aparecem no Mercado para comparação, mas não são vinculadas automaticamente ao produto do lojista nem usadas para sugestão financeira.

## 6. Validação e limitações

- `npm run typecheck`: passou.
- `npm run lint`: passou com 9 avisos preexistentes fora do Index.
- `npm test`: 31 arquivos e 144 testes passaram, incluindo 70 códigos únicos, BRL inválido, edição e número diferentes, deduplicação, qualidade e autorização básica da API.
- `npm run db:check`: cadeia de snapshots válida, sem drift.
- `npm run build`: passou; as cinco rotas versionadas e as páginas de Mercado/Admin foram incluídas no build dinâmico.
- `scripts/verify-geekprice-index.ts`: passou contra PostgreSQL local isolado, com busca, preço, histórico, contagens e deduplicação.
- `scripts/verify-geekprice-index-http.ts`: passou contra o servidor de produção local com sessão Auth.js real. Sem sessão, a rota retornou 401; com sessão, busca, preço, histórico, cobertura e fontes retornaram 200. Confirmou 70 cartas, 70 com preço, mínimo de R$ 1.500,00 e média da fonte de R$ 5.180,43 para Charizard Base Set.
- E2E Chromium: passou na página de Mercado, incluindo busca, seleção da impressão, preços e atribuição. A captura local está em `.tools/geekprice-index-market.png`.
- O teste de segurança do seed confirmou que ele para antes de gravar quando `DATABASE_URL` não está configurada.

**Estado real do banco isolado nesta máquina: 70 cartas, 70 observações, uma fonte e uma execução de atualização com um erro HTTP 403 registrado.** A API própria serviu esses dados no teste HTTP autenticado. O PostgreSQL local é apenas ambiente de desenvolvimento; ainda falta configuração operacional de hospedagem.

## 7. Custos e próximos passos

O piloto requer quatro buscas por nome para atualizar até 70 impressões; no limite anônimo de 10 requisições/minuto, a espera intencional é de 7 segundos entre buscas. Para milhares de cartas, o custo principal será volume de consultas autorizado, não os poucos KB por observação. Como ordem de grandeza, 1.000 nomes distintos no limite anônimo levam pelo menos 100 minutos de cota de API, sem contar rede e pausas. O banco cresce linearmente com impressões e mudanças de preço; deduplicação evita snapshots idênticos. Custos monetários de Railway/Supabase não foram estimados sem plano e tarifas contratados.

1. Homologar direitos de armazenamento/retensão e limites para uso continuado da API MYP, mantendo atribuição visível, e obter acesso aceito para chamadas do worker no backend.
2. Implementar revisão administrativa e vinculação cruzada segura por código de coleção, número e variante.
3. Adicionar importação CSV com proveniência própria, testes de isolamento multiempresa e fila distribuída antes de escalar.

Consulte [o plano de expansão](GEEKPRICE_INDEX_EXPANSION_PLAN.md).
