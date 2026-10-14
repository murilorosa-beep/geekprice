# Pesquisa de e-commerce e ERP — Fase 5

Validada em 13/10/2026 somente em documentação oficial.

- **Bling API v3:** OAuth 2.0, aplicação registrada e autorização do cliente. Produtos/estoques dependem dos escopos aprovados e estão sujeitos aos limites informados pelo Bling. Sem credenciais disponíveis; conector não ativado.
- **Nuvemshop:** requer aplicativo, OAuth e aprovação conforme o programa de parceiros. Produtos e variantes podem ser lidos conforme escopos. Sem `client_id`, segredo ou loja de teste; conector não ativado.
- **WooCommerce REST API v3:** cada loja gera Consumer Key/Secret com permissão `read`, `write` ou `read_write`. A integração deve usar HTTPS; o modo inicial planejado é `read`. Sem URL/chaves de uma loja; conector não ativado.
- **Google Books:** a API v1 consulta volumes por `isbn:` e exige identificação por chave para dados públicos. Os termos proíbem cobrar pelo uso da aplicação sem acordo separado/permissão escrita e exigem atribuição/branding. O conector fica desativado sem `GOOGLE_BOOKS_API_KEY` e não deve ser habilitado comercialmente sem análise jurídica/acordo.

Não há tokens no frontend nem integração simulada. A interface comum em `src/server/commerce/types.ts` é somente leitura; qualquer escrita futura exigirá consentimento e escopo próprios, além de `origin`/versão para impedir sincronização circular.

Fontes oficiais:

- https://developer.bling.com.br/
- https://dev.nuvemshop.com.br/
- https://woocommerce.github.io/woocommerce-rest-api-docs/
- https://developers.google.com/books/docs/v1/using
- https://developers.google.com/books/terms
- https://developers.google.com/books/branding
