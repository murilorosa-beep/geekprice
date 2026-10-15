# Comparação de provedores BRL — GeekPrice

Pesquisa em 14/10/2026. Nenhum plano foi contratado nem token de terceiro foi utilizado.

| Fonte | BRL / jogos | Contrato e acesso | Decisão |
|---|---|---|---|
| MYP Cards | Preços mínimo/médio/máximo em BRL; Pokémon e Magic | API REST oficial, `X-Api-Token`, 10 req/min sem token e 60 com token; atribuição visível obrigatória. Documentação define busca por nome, código e edições. | **Escolhida e preparada.** Melhor fonte brasileira com contrato público verificável. A homologação comercial SaaS e token aprovado ainda dependem do titular. |
| TCGData | Conversão para BRL documentada; cobertura de vários jogos | `X-API-Key`; preço de anúncio/oferta; planos de US$ 9,90 a US$ 29,90/mês; licença permite análises e recomendações, mas proíbe redistribuir dados brutos. | Alternativa paga, não contratada. Não é referência brasileira nativa comprovada. |
| Mercado Livre | Catálogo/anúncios potencialmente BRL | APIs oficiais exigem app/OAuth e autorização apropriada; qualidade de edição/acabamento precisa ser avaliada por variante. | Não integrado: não há autorização, e anúncio sem variante precisa não pode virar preço automático. |
| Liga Pokémon / Liga Magic | Anúncios BRL | Nenhuma API/parceria/licença demonstrada nesta revisão. | Scraping HTML permanece desabilitado por padrão; não é usado pelo fluxo MYP. |
| CSV de parceiro/lojista | BRL, Pokémon e Magic conforme dados fornecidos | Fluxo interno existente, com procedência privada e aprovação manual. | Disponível agora como alternativa útil, sem alegar API homologada. |

## Evidências oficiais

- [MYP — acesso à API](https://mypcards.com/acesso-api): token, limites e atribuição.
- [MYP — OpenAPI](https://github.com/MYPCards/mypcards-api/blob/main/swagger.yaml): `/{jogo}/carta/{nome}`, `/{jogo}/precos`, `/{jogo}/precos/{codigo}`, `pokemon`/`magic`, paginação e campos de preço BRL.
- [TCGData — documentação](https://www.tcgdataapi.com/en/docs/) e [termos](https://www.tcgdataapi.com/termos/).
- [Mercado Livre Developers](https://developers.mercadolivre.com.br/): requer validação comercial/OAuth antes de qualquer integração.

## Solicitação sugerida ao MYP

“Somos o GeekPrice, SaaS B2B para lojistas brasileiros de Pokémon e Magic. Precisamos consultar, no servidor, preços de oferta de cartas por nome/edição para exibi-los com atribuição MYP Cards e gerar recomendações que sempre exigem aprovação manual. Não redistribuiremos dumps nem exporemos o token. Qual plano/permissão comercial se aplica e há limites/cache adicionais para este uso?”
