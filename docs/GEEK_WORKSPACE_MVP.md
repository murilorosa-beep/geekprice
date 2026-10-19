# Coleções e encomendas geek — primeira versão

## Acesso

Rotas `/collections` e `/commissions`, no menu e em **Meus softwares**. Os dois módulos usam a organização, os membros e o estado de assinatura atuais. Não criam cobranças nem assinaturas adicionais. Owner/admin podem gravar; membros e assinaturas em somente leitura podem consultar. Assinatura bloqueada impede o acesso.

Nesta versão, os módulos são benefícios da organização atual, não produtos vendidos separadamente. A venda independente ou um pacote comercial com múltiplos produtos exigirá regras próprias de entitlement e cobrança.

## Coleções

- Cadastro, edição e exclusão de mangás, HQs, figures, jogos, cartas autorais e outros itens.
- Série, volume/edição, quantidade, custo unitário, data de compra, localização e observações.
- Situações: na coleção, quero ter, a caminho e emprestado.
- Empréstimo com destinatário e data prevista opcional. Para devolver, mudar para “Na coleção”. O estado vale para todas as unidades do cadastro; separar cadastros para unidades em situações diferentes.
- Foto por URL HTTPS. Upload de arquivo, catálogo externo, sugestão automática de volumes faltantes e avaliação de mercado não fazem parte desta versão.
- Resumo global: unidades próprias, desejos, empréstimos e custo de aquisição (preço unitário × quantidade dos itens próprios, incluindo emprestados). Os filtros afetam a lista; o resumo permanece global.
- Galeria com álbuns por categoria e alternância entre coleção e tabela. Contagem dos álbuns calculada no servidor para toda a organização, sem depender da página ou dos filtros. Barra = unidades próprias / unidades cadastradas naquela categoria.
- Busca por título/série/edição, categoria, situação e faixa de custo unitário; filtros de custo aplicados no banco antes da paginação.
- Arte original do banner e detalhes do processo em `COLLECTION_GALLERY_ART.md`.

## Encomendas

- Cadastro, edição e exclusão de projetos de cosplay, artesanato, impressão 3D e outros.
- Interface de ateliê com banner original, indicadores, cartões e tabela. Etapas clicáveis filtram os projetos; contagens globais calculadas no servidor. Formulário dividido em projeto/cliente, custos/tempo e valores/recebimentos. Arte documentada em `COMMISSION_STUDIO_ART.md`.
- Cliente, contato, quantidade de peças, prazo e notas internas.
- Etapas manuais: orçamento, aprovada, em produção, pronta, entregue e cancelada.
- Materiais com quantidades fracionadas e custos unitários; horas totais, valor/hora e despesas adicionais.
- Custo estimado = soma dos materiais + horas × valor/hora + despesas. Os custos são da encomenda inteira, não por peça.
- Sugestão = custo / (1 − margem/100), arredondada para cima em centavos. Sem avaliação automática da arte ou demanda.
- Valor combinado e recebido informados manualmente. O saldo nunca pode ser negativo. A receber exclui orçamentos e cancelados, mas inclui entregues com saldo.
- Cópia de resumo do orçamento para compartilhar manualmente. Não inclui notas internas nem custos detalhados.
- Não processa pagamentos, estornos, impostos ou documentos fiscais. Taxas e despesas devem ser incluídas pelo usuário. Cancelar preserva os valores registrados.

## Banco e proteção dos dados

Migration `0014_geek_collections_and_commissions.sql`: duas tabelas novas, índices, checks e RLS; revoga acesso das roles públicas `anon` e `authenticated` quando existem. Não altera estoque, usuários, planos nem preços anteriores.

As consultas e mutações sempre usam `organizationId` da sessão; IDs de outra organização retornam 404. Edição/exclusão exigem a versão atual do registro (409 em conflito). Validação ocorre no servidor. Limite inicial: 5.000 cadastros por organização em cada módulo; paginação de 24 registros.

## Publicação

1. Fazer backup do banco de destino.
2. Executar `npm run db:migrate` no ambiente de destino (ou configurar como pre-deploy no Railway, conforme `RAILWAY_DEPLOY.md`).
3. Publicar a aplicação pelo fluxo normal de Git/Railway.
4. Conferir `/collections`, `/commissions` e `/platform` com uma conta existente.

## Verificação

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:check`, `npm run build`.
- `tests/integration/geek-workspace.integration.test.ts` exige o banco isolado configurado em `.env.phase81`; testa persistência, isolamento entre organizações, conflitos de edição, devolução e valores do orçamento.
- Testes não devem ser executados contra o banco comercial.
- `scripts/verify-geek-workspace-browser.ts` verifica a interface desktop/mobile, cálculos e permissões com contas temporárias, removidas ao terminar. Iniciar o build local na porta 3109 com `.env.phase81` e executar `node --env-file=.env --env-file=.env.phase81 --import tsx scripts/verify-geek-workspace-browser.ts`. O script recusa banco comercial e URL não local.
