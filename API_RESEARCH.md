# Pesquisa de APIs de mercado — Fase 4

Pesquisa validada em 13/10/2026. Nenhum endpoint foi inferido e não há scraping.

| Fonte | Estado e acesso | Preços/moedas | Custos e limites | Uso no GeekPrice |
|---|---|---|---|---|
| Scryfall | API pública para Magic; consultas e detalhe por impressão | USD/EUR, foil e não foil quando presentes | Sem chave; o cliente usa timeout, backoff, cache e volume conservador | **Ativa** para catálogo Magic, cadastro inteligente e referências internacionais; não representa preço BR |
| TCGdex | API e base abertas, sem chave; REST v2 testada em `api.tcgdex.net` | Cardmarket (EUR) e TCGplayer (USD), quando presentes; data de atualização vem da fonte | Gratuita. A documentação pública não declara uma cota contratual; o conector usa cache de 1 h, timeout, backoff e limite local de resultados | **Ativa** para catálogo Pokémon e referências internacionais. Dados nunca são rotulados como mercado BR |
| Scrydex | Serviço ativo, exige conta e chave | Catálogo multi-TCG, tendências e histórico; cobertura/moeda dependem do plano e endpoint contratado | Starter US$ 29/mês (5.000 créditos), Growth US$ 99 (50.000), Professional US$ 399 (250.000); histórico custa 3 créditos na tabela consultada | Pendente de chave, contrato e validação dos direitos de persistência para o plano escolhido |
| Pokémon TCG API | Oficialmente descontinuada; novas chaves indisponíveis e chaves existentes anunciadas apenas até 01/03/2027 | TCGplayer/Cardmarket, USD/EUR | Legado | Rejeitada como dependência principal |
| Mercado Livre Developers | API oficial requer aplicação/OAuth e está sujeita às políticas do programa | Anúncios em moeda do site; anúncio não equivale a venda concluída | Quotas e acesso dependem da aplicação aprovada | Pendente de credenciais e aprovação. Nenhum scraping ou sucesso simulado |

## Regras de dados

- A integração ativa persiste origem, moeda, região, tipo de preço, referência, coleta, condição, acabamento e fingerprint idempotente.
- TCGdex agrega referências de terceiros. Antes de uso comercial em produção, o operador deve confirmar as licenças, atribuições e direitos de retenção aplicáveis a TCGdex, imagens, Cardmarket e TCGplayer.
- Conversão cambial não foi implementada. USD/EUR são referências internacionais, não preços brasileiros.
- Preços BRL autorizados poderão ser importados por parceiros numa etapa seguinte, após definição de contrato/layout.

## Links oficiais consultados

- https://tcgdex.dev/
- https://github.com/tcgdex/cards-database
- https://scryfall.com/docs/api
- https://docs.pokemontcg.io/
- https://scrydex.com/pricing
- https://developers.mercadolivre.com.br/
