# GeekPrice — identidade visual TCG

Revisão de 15/10/2026, após o retorno de que a primeira mudança estava genérica.

## Diagnóstico

A primeira revisão trocou cores, mas preservou a composição de um dashboard genérico. O painel quase não exibia imagens do acervo; o catálogo usava um ícone de banco de dados como elemento principal. Havia fundos claros herdados em componentes escuros, filtros estreitos no celular, instruções sempre abertas e poucos estados de interação.

Foram preservados os formulários, a tabela de gestão, os filtros, os links existentes e todos os controles de preços e permissões.

## Direção visual

Base grafite com violeta, dourado e referências a cartas de coleção. O destaque do painel combina cartas reais do estoque com molduras e detalhes de coleção. Na ausência de fotos, utiliza cartas decorativas originais, com símbolos geométricos e ícones de água, fogo e eletricidade. Essas artes não representam produtos ou raridades reais.

O tema está concentrado em `src/app/tcg-theme.css`, importado depois dos estilos legados. O componente `src/components/tcg-art.tsx` reúne o símbolo da marca e o leque de cartas.

| Token | Cor | Uso |
| --- | --- | --- |
| `--bg` | `#0D0E17` | Fundo principal |
| `--panel` | `#161722` | Superfícies |
| `--ink` | `#F2F1FA` | Texto principal |
| `--muted` | `#9A9AAF` | Texto secundário |
| `--line` | `#2A2B3E` | Divisórias |
| `--violet` | `#B29AFF` | Links e foco |
| `--gold` | `#E9BF72` | Coleção e destaques |
| `--green` | `#74D6AF` | Estado positivo |

Tipografia de sistema, sem novas fontes ou bibliotecas. Números financeiros usam algarismos tabulares quando aplicável.

## Implementado

- Navegação com marca de cartas, seleção dourada, breadcrumb e menu mobile identificado para tecnologias assistivas.
- Dashboard com destaque em leque, fotos do próprio estoque, valor de venda do estoque e vitrine de até cinco itens. O valor é a soma de preço cadastrado × quantidade; não representa lucro nem conversão de preço externo.
- A busca do painel filtra a vitrine e a tabela. As fotos aparecem também na tabela.
- Indicadores com composição inspirada em atributos de uma carta. Nenhum percentual de crescimento foi inventado.
- Produtos com alternância Tabela / Coleção, usando a mesma página de resultados e os filtros existentes. A tabela continua sendo a visualização inicial.
- Fotos, coleção, código, idioma, condição, acabamento, preço e quantidade no modo Coleção. Raridade não é inventada.
- Instruções e orientações de preço expansíveis para reduzir a ocupação de espaço na gestão de estoque.
- Cabeçalhos de Catálogo e Mercado com arte de cartas; correção dos fundos claros em componentes compartilhados dessas áreas.
- Login com composição própria, cartas originais e formulário preservado.
- Entrada de página, apresentação escalonada dos indicadores, abertura dos modais, elevação de cartas e brilho foil ao interagir. Leque com inclinação por ponteiro, sem re-renderizar a tela a cada movimento.
- `prefers-reduced-motion`, foco por teclado e imagens do acervo com carregamento lazy. Nenhuma dependência adicionada.

## Escopo preservado

A única extensão nos dados do dashboard é o campo opcional `imageUrl`, já disponível na consulta existente de estoque. Não foram alterados banco, migrations, autenticação, isolamento de organizações, fórmulas financeiras, HMAC, fontes de preço, pagamentos ou worker.

## Validação

Foi montada uma prévia estática em `.tools/tcg-preview`, ignorada pelo Git. Ela renderiza os componentes reais com dados sintéticos locais, substitui a navegação do framework e intercepta as chamadas de API. Não carrega `.env`, não abre conexão com banco e bloqueia operações de escrita. Os preços e cartas das capturas são de demonstração, não cotações do usuário.

- TypeScript: aprovado.
- ESLint: exit code 0; 9 avisos preexistentes.
- Vitest: 28 arquivos e 122 testes aprovados.
- Build Next.js com Webpack: exit code 0; 76 rotas processadas.
- Playwright com Chrome: scripts da prévia concluídos com exit code 0 e sem erros de JavaScript.
- Dashboard em 1920, 1366, 768 e 390 pixels: sem overflow da página.
- Produtos, Catálogo, Mercado e Login em 390 pixels: sem overflow da página; tabelas mantêm sua rolagem interna.
- Alternância de coleção, abertura de detalhes, busca no painel, pesquisa/detalhe do catálogo, menu mobile e preferência de movimento reduzido verificados na prévia.
- Estados de estoque vazio e com apenas uma carta verificados.
- Hover do leque conferido por estilo computado: deslocamento de `0px -8px` com movimento habilitado. Movimento reduzido retorna animação `none`.

Isso valida apresentação e interações dos componentes. Não equivale a E2E transacional da aplicação com banco: cadastro, envio de e-mail, importação efetiva, aprovação e rollback não foram executados nesta revisão visual.

## Capturas

As capturas anteriores fornecidas pelo usuário são a referência do estado inicial. As novas capturas, com dados de demonstração, estão em `docs/ui-redesign/`:

- `dashboard-desktop.png`
- `products-desktop.png`
- `login-desktop.png`
- `collection-mobile.png`

## Limites desta revisão

Dashboard, Produtos, Catálogo, Mercado, Login e navegação receberam composição específica. Autopilot, Alertas, configurações e demais telas de autenticação herdam o tema compartilhado, mas não receberam uma reformulação individual completa. A landing page pública continua com sua composição existente. Não há novo selo de conformidade ou promessa de integração ativa.

A validação desta revisão foi realizada localmente, antes do envio ao Git.

## Correção dos módulos após os prints do usuário

Foram reproduzidos e corrigidos os resultados da PkmnPrices com imagens maiores que os botões, os blocos brancos do modal e do histórico, textos de pouco contraste e ações sem espaçamento.

- PkmnPrices agora tem componentes próprios de busca, seleção de coleção, grade de impressões, detalhe e tabela de preços. Os resultados não usam mais a altura fixa de um botão secundário. A seleção leva ao detalhe com rolagem que respeita movimento reduzido.
- Condição e acabamento continuam filtrando as linhas recebidas da API; foram verificados três preços de teste, dois para Near Mint e um para Near Mint + Reverse Holo.
- Imagens das dez impressões de teste permaneceram dentro dos respectivos componentes em 1920, 1366, 768 e 390 pixels.
- Os detalhes do estoque e o histórico usam superfícies escuras com texto legível. Os fundos foram verificados por estilo computado, além da inspeção das capturas.
- Tabela de produtos com valores alinhados, moeda em pt-BR e ações com espaçamento próprio. Idioma, condição e acabamento receberam rótulos de apresentação; os valores gravados permanecem iguais.
- Ajustes de superfícies, botões, seleção e contraste em regras, canais e indicadores do Autopilot, formulários, plano e equipe. O grid de quatro indicadores do Autopilot passou a ter configuração própria, independente dos seis indicadores da dashboard.
- O texto de importação CSV descreve o registro de referências no histórico e deixa de prometer elegibilidade automática para precificação.

Validação adicional: build de produção aprovado, TypeScript aprovado, lint dos arquivos alterados sem erros ou avisos, 28 arquivos / 122 testes aprovados e scripts visuais concluídos com exit code 0. Mercado, Produtos, Configurações, Plano, Equipe e Autopilot foram renderizados em desktop e celular na prévia estática, sem erros de JavaScript ou overflow da página. O modal do estoque também foi verificado em 390 pixels. Essa verificação continua sendo de apresentação e interação em ambiente sem banco, não um E2E transacional de produção.

Novas capturas de demonstração: `market-results-desktop.png`, `market-results-mobile.png`, `market-stock-modal.png`, `market-price-detail.png`, `market-history.png` e capturas dos módulos revisados em `docs/ui-redesign/`.

## Vitrine pública de marketing

A página inicial passou a apresentar a marca e a plataforma, com GeekPrice como produto principal. A composição usa título editorial, cartas originais em destaque, efeitos de interação, apresentação da interface, benefícios, sequência de uso, área da plataforma, planos, FAQ e chamada final para cadastro.

- `src/components/marketing-home.tsx` concentra a apresentação e as interações leves da página. `src/app/marketing.css` contém estilos com prefixo `mkt-`, separados dos módulos do aplicativo.
- `src/app/page.tsx` preserva os redirecionamentos de sessão e onboarding e consulta o mesmo catálogo público. Somente os campos públicos necessários são enviados ao componente.
- Planos, preços, limites, período de teste e recursos vêm do catálogo cadastrado. Produtos adicionais aparecem apenas quando retornados pelo catálogo público; a seleção de planos por software já está preparada.
- Foram removidos indicadores fictícios de estoque, recomendações e tendências, além de afirmações de lucro garantido, preços em tempo real e certificações sem comprovação.
- As duas capturas da interface em `public/marketing/` usam dados de demonstração e estão identificadas assim na vitrine. Não mostram dados comerciais do usuário. São servidas por `next/image`, com dimensões e `sizes` definidos e carregamento lazy.
- O leque usa a arte original existente, sem requisições a APIs de cartas. A página tem menu mobile, alternância de capturas, FAQ nativo, link para pular ao conteúdo e preferência de movimento reduzido.
- A animação de entrada das seções usa IntersectionObserver, sem biblioteca adicional. O conteúdo está presente no HTML; o movimento é um complemento visual.

Verificação em prévia estática isolada, sem banco ou chamadas de API: larguras de 1920, 1366, 768, 390 e 360 pixels; navegação mobile; alternância de capturas; FAQ; catálogo sem planos; catálogo com mais de um software; ausência de erros de JavaScript e de overflow da página. O hover das cartas foi confirmado, todas as seções ficaram visíveis após rolagem e a preferência de movimento reduzido desativou as animações. As capturas estão em `docs/ui-redesign/marketing/`; os preços nelas são exemplos de teste, enquanto a aplicação lê os valores reais do catálogo.

TypeScript, lint dos arquivos alterados e os 28 arquivos / 122 testes foram aprovados. O build de produção também foi executado para esta etapa. A publicação desta página não faz parte da validação visual local.
