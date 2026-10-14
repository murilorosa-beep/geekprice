# Relatório da Fase 5 — 13/10/2026

## Implementado

- Fluxo completo **Cadastro Inteligente** em Produtos: busca TCGdex por nome ou identificador, escolha explícita da edição, confirmação de acabamento e preenchimento apenas dos dados privados da loja.
- Nome, coleção, número, raridade, imagem, idioma e identificador canônico são preenchidos pelo catálogo.
- SKU da organização foi separado do identificador canônico e do SKU técnico legado. A mesma carta não é reconciliada apenas pelo nome.
- Repetir o cadastro da mesma variante não sobrescreve custo, preço ou quantidade: o lojista deve usar a edição existente.
- Campo opcional de código de barras no estoque, isolado por organização.
- Validador ISBN-10/ISBN-13 com restrição de prefixo Bookland para ISBN-13; códigos EAN comuns não são tratados como ISBN.
- Endpoint Google Books configurável em `/api/catalog/isbn`; sem chave ele informa a pendência e não simula resultado.
- Interface modular somente leitura para Bling v3, Nuvemshop e WooCommerce.
- Estrutura persistente de conexões, cursores incrementais, execuções, contadores, conflitos, erros e mapeamentos externos.
- Credenciais externas preparadas para AES-256-GCM no servidor; nunca são enviadas ao frontend.
- Migrations aditivas `0004_omniscient_living_lightning.sql` e `0005_luxuriant_owl.sql` aplicadas.

## Integrações

- **Testada/ativa:** TCGdex para o cadastro inteligente Pokémon.
- **Configurável, não ativa:** Google Books; exige `GOOGLE_BOOKS_API_KEY` e aprovação jurídica/comercial dos termos e branding.
- **Pendentes de credenciais e loja de teste:** Bling API v3, Nuvemshop e WooCommerce. Nenhum conector foi apresentado como funcional sem OAuth/chaves.

## Validação

- TypeScript e ESLint passaram.
- 29 testes em 9 arquivos passaram, incluindo ISBN, código de barras, valores monetários e contrato do cadastro inteligente.
- Build de produção passou com Next.js 16.4.0.
- Migrations aplicadas ao PostgreSQL existente sem apagar dados.

## Limitações e próximas prioridades

- O Google Books não está exposto no formulário enquanto chave e uso comercial não forem aprovados; o endpoint e a validação já existem.
- Bling/Nuvemshop/WooCommerce possuem contrato comum e banco preparado, mas faltam autorização OAuth, tela de conexão e execução contra lojas reais.
- A importação CSV existente continua idempotente por arquivo e SKU, mas ainda não oferece revisão linha a linha de correspondências canônicas.
- Próxima prioridade: obter uma loja sandbox/credenciais Bling ou Nuvemshop, implementar OAuth com estado/PKCE conforme o provedor e executar a primeira sincronização somente leitura com revisão de conflitos.

Consulte `ECOMMERCE_RESEARCH.md` para fontes oficiais e restrições.
