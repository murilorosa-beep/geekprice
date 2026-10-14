# GeekPrice — Fase 6: base comercial multijogo

Atualizado em 13/10/2026. Este documento separa recursos realmente ativos de integrações que ainda dependem de contrato, credenciais ou homologação.

## Entregue

- Catálogo unificado autenticado em `/catalog`, com seleção de jogo, busca e confirmação da impressão exata antes do cadastro.
- Pokémon via TCGdex, com catálogo multilíngue e referências internacionais disponíveis na fonte.
- Magic: The Gathering via Scryfall, com impressão, coleção, número, idioma, acabamento, imagem e referências USD/EUR.
- Cadastro inteligente de cartas Magic no estoque, preservando SKU, custo, preço e quantidade por organização.
- Vínculo explícito entre item do estoque e registro externo, com observações de preço idempotentes.
- Página `/integrations`, que informa o estado real de cada provedor e nunca apresenta uma integração sem credenciais como ativa.
- Estrutura Scrydex para Pokémon, Magic, Lorcana, One Piece, Gundam e Riftbound. As chaves ficam exclusivamente no servidor.

## Configuração

TCGdex e Scryfall não exigem segredo no ambiente atual. Para ativar os demais jogos, contrate um plano Scrydex e configure:

```env
SCRYDEX_API_KEY=
SCRYDEX_TEAM_ID=
```

Depois, reinicie o servidor. Sem essas variáveis, a API responde `503` com uma mensagem clara e a interface mantém o recurso indisponível.

## Limites comerciais ainda abertos

- Scryfall e TCGdex fornecem referências internacionais; USD/EUR não são convertidos nem apresentados como preço brasileiro.
- O operador deve validar os termos de uso, atribuição, imagens e retenção de dados de cada provedor antes do lançamento público.
- Scrydex exige conta, plano, chave e equipe. A cobertura de preços varia por jogo, mercado e plano contratado.
- Bling, Nuvemshop e WooCommerce continuam aguardando aplicativos OAuth e credenciais reais da empresa.
- Cobrança recorrente de clientes, checkout, emissão fiscal, termos de uso, política de privacidade, suporte e monitoramento produtivo ainda precisam ser contratados/configurados antes de uma venda pública em escala.

## Critério recomendado para começar a vender

O produto já pode entrar em piloto assistido com lojas de Pokémon e Magic. Para venda pública, conclua primeiro: domínio e ambiente de produção, backups/monitoramento, contrato de dados, política de privacidade/LGPD, gateway de cobrança e um fluxo de suporte. Lorcana, One Piece, Gundam e Riftbound só devem constar na oferta depois da ativação e homologação da Scrydex.

## Validação técnica

- TypeScript estrito e ESLint.
- Testes dos conectores, parsing defensivo e precificação.
- Build de produção do Next.js.
