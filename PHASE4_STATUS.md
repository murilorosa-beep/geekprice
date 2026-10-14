# Relatório da Fase 4 — 13/10/2026

## Implementado

- Busca Pokémon por nome, coleção, número e idioma usando TCGdex.
- Detalhe de edição, raridade, acabamento, identificador e imagem fornecida pela fonte.
- Associação manual entre edição externa e produto da organização; não há vínculo automático por nome.
- Persistência de moeda, região, tipo de preço, condição, acabamento, data de referência/coleta, origem e fingerprint.
- Tela Mercado com fonte, mínimo, mediana, intervalo, atualização, filtros e histórico real de 7/30/90 dias.
- Isolamento de moedas/variantes e aviso explícito para referências internacionais.
- Atualização administrativa desacoplada em `POST /api/market/refresh`.
- Alertas deduplicados para variações comparáveis de 10% e marcação como lido.
- A listagem/recomendação em BRL só consulta observações BRL da região BR.

## APIs

- **Ativa e testada:** TCGdex, sem chave, catálogo Pokémon e referências Cardmarket (EUR)/TCGplayer (USD) quando presentes.
- **Rejeitada como principal:** Pokémon TCG API, oficialmente descontinuada.
- **Pendentes:** Scrydex (a partir de US$ 29/mês, chave/contrato) e Mercado Livre (aplicação OAuth/aprovação). Nenhum sucesso é simulado.

## Banco e validação

Migration aditiva `0003_marvelous_celestials.sql` aplicada sem remoção de dados. `npm run typecheck`, `npm run lint`, `npm test` (23 testes/7 arquivos) e `npm run build` passaram com Next.js 16.4.0.

## Limitações e próxima fase

- Não há fonte BRL ativa nem câmbio; USD/EUR não representam o mercado brasileiro.
- A importação CSV específica para observações de parceiros ainda precisa de layout/contrato; a importação existente é de estoque.
- O refresh requer sessão administrativa; falta autenticação própria para um agendador periódico.
- Alertas de desatualização dependem desse agendador. Alerta de venda abaixo do mínimo depende de um módulo de vendas ainda inexistente.
- O dashboard resumido ainda não usa a série histórica; a página Mercado já usa somente dados persistidos.
- Antes de produção, confirmar contratualmente direitos comerciais, imagens, atribuição e retenção de dados de cada provedor.

A próxima fase recomendada é contratar uma fonte brasileira ou parceiro CSV, criar credencial de cron de escopo restrito e integrar vendas reais ao motor de alertas/recomendações.
