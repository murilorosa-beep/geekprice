# GeekPrice

Para a instalacao conectada ao Supabase, consulte [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). O inicializador reconhece PostgreSQL remoto sem Docker; migrations e seed remotos exigem execucao explicita depois de backup.

Estado técnico mais recente: [PROJECT_STATUS.md](PROJECT_STATUS.md). A aplicação principal usa Supabase; o PostgreSQL local descrito abaixo é uma opção para instalações separadas.

SaaS B2B multiempresa para controle de estoque e inteligência de preços de lojas de TCG e produtos geek.

## Stack

- Next.js 16, React e TypeScript estrito
- PostgreSQL 17 e Drizzle ORM
- Auth.js/NextAuth com Credentials e sessões JWT de oito horas
- Zod para validação de entrada
- `decimal.js` para cálculos monetários
- Vitest e ESLint

## Recursos implementados

- Login e logout com senha armazenada usando Argon2id. Contas bcrypt legadas são migradas após o primeiro login válido.
- Sessão assinada de oito horas e limitação persistente de tentativas em duas camadas (máx. 5 falhas por IP sanitizado e bloqueio por conta com 10 falhas em 15 minutos contra brute-force distribuído).
- Organizações e papéis `owner`, `admin` e `member`.
- Revalidação de membership no servidor e isolamento estrito por `organization_id`.
- Isolamento multi-tenant de SKU: SKUs internos são exclusivos por organização (`inventory_org_sku_uidx`), com variantes não catalogadas protegidas contra sequestro entre lojas.
- Schema PostgreSQL com migrations SQL (até `0013_distributed_integrity.sql`), índices, constraints e proteção da Data API.
- CRUD HTTP de estoque com busca, filtro por categoria e paginação.
- Catálogo multijogo (Pokémon via TCGdex e Magic via Scryfall) e cadastro inteligente.
- Módulo de importação de referências de mercado brasileiras (BRL) via CSV em duas etapas (`preview` e `commit`), com validação Zod, deduplicação por hash/fingerprint e persistência em `price_observations`.
- Histórico real de mercado no Dashboard (`/api/market/history`), com períodos de 7, 30 e 90 dias, estatísticas reais e tratamento honesto de dados ausentes (sem curvas fabricadas).
- Motor de precificação explicável com Decimal.js e Autopilot supervisionado com trava de margem, modo seguro e rollback de lote.
- Importação CSV de estoque em duas etapas com validação e limites de plano.
- Estados de carregamento, erro e catálogo vazio em toda a aplicação.
- Configurações persistidas da organização e política de preços, com BRL, taxas, custos adicionais e margens.
- Recomendações reais e versionadas por parâmetros, sem duplicação quando os dados não mudam.
- Navegação funcional para Produtos, Mercado, Recomendações, Alertas, Minha Loja e Configurações.
- Cadastro público com confirmação de e-mail, recuperação de senha, onboarding e aceite versionado dos documentos.
- Convites de equipe, papéis e limites de assentos aplicados no servidor.
- Página de consumo, catálogo de planos configurável e integração de assinatura recorrente com Mercado Pago.


## Gestão e precificação

- `/products`: CRUD visual do estoque da organização. Metadados globais do catálogo são definidos no cadastro; edições posteriores alteram apenas custo, preço, quantidade e margem privados da loja.
- `/store`: nome da organização, nome comercial e moeda.
- `/settings`: taxas de marketplace, custos adicionais, margens mínima/desejada e desconto de referência do mercado.
- `/recommendations`: preço mínimo rentável, margem estimada, preço recomendado, justificativa, filtros e prioridades.
- `/market`: informa honestamente quando não há conectores ou observações externas.
- `/alerts`: lista somente alertas persistidos da organização.

Escritas exigem papel `admin` ou `owner`. Leituras exigem sessão e membership válido. As APIs novas são `/api/organization`, `/api/pricing-policy` e `/api/recommendations`.

## Configuração local

### Inicialização automática no Windows

Execute com duplo clique:

```text
iniciar-geekprice.cmd
```

Na primeira execução, o script cria `.env`, gera automaticamente um segredo de sessão e solicita o e-mail e a senha do administrador sem exibir a senha. Na mesma execução, ele verifica Node.js e Docker, abre e aguarda o Docker Desktop quando necessário, instala dependências, inicia o PostgreSQL, aguarda o healthcheck, aplica migrations, executa o seed de forma idempotente e inicia o servidor web.

Também pode ser executado pelo PowerShell:

```powershell
.\scripts\start-geekprice.ps1
```

Opções disponíveis: `-SkipInstall` e `-SkipSeed`.

### Inicialização manual

1. Copie `.env.example` para `.env` e altere os segredos.
2. Inicie somente o banco:

```bash
docker compose up -d postgres
```

3. Instale dependências e aplique a migration:

```bash
npm install
npm run db:migrate
```

4. Defina `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` no `.env` e crie a primeira organização:

```bash
npm run db:seed
```

5. Execute a aplicação com `npm run dev` e acesse `http://localhost:3000`.

O seed cria a organização `GeekPrice Admin`, nunca possui senha padrão no código e recusa senhas menores que 12 caracteres.

## CSV de estoque

```csv
produto,categoria,sku,colecao,numero,idioma,condicao,acabamento,custo,preco,quantidade,margem
Pikachu ex,Pokemon,PK-001,Colecao 151,25/165,pt-BR,new,standard,10.50,20.00,2,25
```

- Máximo de 2 MB e 2.000 linhas.
- O SKU interno é exclusivo dentro de cada organização; variantes manuais de lojas diferentes não compartilham metadados privados.
- Uma organização possui somente um item de estoque por variante.
- O mesmo arquivo não pode ser confirmado duas vezes pela mesma organização.
- Arquivos com qualquer linha inválida precisam ser corrigidos antes da confirmação.

## Banco e migrations

O schema está em `src/db/schema.ts` e as migrations versionadas ficam em `drizzle/`.

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

Não use `drizzle-kit push` em produção. Faça backup antes de migrations produtivas e revise o SQL gerado.

## Segurança multiempresa

Rotas e serviços não recebem `organization_id` do navegador. `requireOrganization()` deriva usuário e organização da sessão assinada e confirma o membership no PostgreSQL. Todas as operações privadas filtram pelo identificador confirmado.

Membros podem consultar. Alterações e importações exigem `admin` ou `owner`. A interface nunca é considerada uma barreira de autorização; as verificações ficam nas rotas e na camada de dados.

## Validação

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Os testes cobrem cálculos e arredondamento, custos adicionais, percentuais inválidos, ausência de preço externo, produtos/estoque, políticas, hierarquia de papéis, isolamento entre organizações e validação CSV. `npm run test:auth` executa ainda um fluxo real e reversível de login, cadastro, edição, política, recomendação, exclusão e logout.

## Mercado real (Fase 4)

O menu **Mercado** pesquisa o catálogo Pokémon da TCGdex por nome, coleção ou número. A associação com o estoque é sempre explícita. As referências Cardmarket/TCGplayer disponíveis são persistidas com moeda, variante, condição, acabamento, datas e fingerprint idempotente.

USD e EUR são referências internacionais: não são convertidos implicitamente nem alimentam recomendações em BRL. A tela agrupa apenas dados comparáveis e oferece períodos de 7, 30 e 90 dias. Administradores podem atualizar vínculos com `POST /api/market/refresh`. Consulte `API_RESEARCH.md` e `PHASE4_STATUS.md` para fontes, custos e pendências.

## Cadastro inteligente (Fase 5)

Em `/products`, use **Cadastro Inteligente** para pesquisar uma carta por nome ou ID TCGdex, revisar edição/acabamento e informar apenas SKU da loja, condição, custo, preço e quantidade. O sistema reutiliza o identificador canônico, mantém dados privados por organização e não sobrescreve um item existente sem edição explícita.

ISBN é validado separadamente de códigos EAN comuns. A consulta Google Books só funciona com `GOOGLE_BOOKS_API_KEY` e após aprovação dos termos comerciais. A estrutura de sincronização Bling/Nuvemshop/WooCommerce é somente leitura e permanece inativa sem credenciais reais. Veja `PHASE5_STATUS.md` e `ECOMMERCE_RESEARCH.md`.

## Base comercial multijogo (Fase 6)

O menu **Catálogo** unifica Pokémon e Magic com confirmação da impressão exata e cadastro no estoque. Pokémon usa TCGdex; Magic usa Scryfall e mantém USD/EUR como referências internacionais. **Integrações** mostra o estado verdadeiro de cada provedor.

Lorcana, One Piece, Gundam e Riftbound estão preparados por meio da Scrydex, mas permanecem desabilitados sem `SCRYDEX_API_KEY` e `SCRYDEX_TEAM_ID`. Consulte `PHASE6_STATUS.md` para o checklist de piloto, produção, cobrança, LGPD e licenciamento de dados.

## Limites atuais

- TCGdex (Pokémon) e Scryfall (Magic) estão ativos. Scrydex e conectores de ERP/e-commerce só ficam disponíveis após configuração de credenciais reais.
- A importação é síncrona e limitada a 2.000 linhas. Um worker poderá ser introduzido quando volume real justificar.
- O checkout Mercado Pago exige credenciais e homologação da conta; nenhum preço/plano comercial vem pré-configurado.
- O cron do Autopilot aceita somente `POST` com `Authorization: Bearer <CRON_SECRET>`; use um segredo aleatório com pelo menos 32 caracteres. Canais de e-commerce e marketplace permanecem em simulação até existir preço separado por canal e um integrador de publicação.
- Os Termos de Uso e a Política de Privacidade são rascunhos. O cadastro público permanece bloqueado até revisão jurídica, configuração das versões aprovadas e habilitação explícita.
- O gráfico histórico usa observações reais e mostra estado vazio quando não há ao menos dois pontos temporais comparáveis.
- O catálogo canônico pode ser compartilhado; SKUs internos e estoque são privados por organização. A interface não altera metadados canônicos globais após o cadastro.
- Cotações BRL de CSV ficam privadas e não são verificadas automaticamente. Só referências com até 30 dias alimentam a precificação; anúncios e vendas informadas aparecem separadamente no Mercado.

## Produto comercial (Fase 7)

O fluxo público está em `/register`. Ele cria loja, proprietário, trial configurável, registros de aceite e envia confirmação pelo Resend. Login exige e-mail confirmado. Recuperação de senha usa link de uso único com expiração; a redefinição invalida sessões existentes. O primeiro acesso autenticado passa por `/onboarding`.

Configure `RESEND_API_KEY` e `RESEND_FROM_EMAIL` para e-mail. Antes de habilitar cadastro público, publique versões revisadas dos documentos, configure `TERMS_VERSION` e `PRIVACY_VERSION` (não use prefixo `draft`) e só então defina `LEGAL_DOCUMENTS_APPROVED=true`. As páginas `/terms` e `/privacy` são modelos incompletos de revisão, não aconselhamento jurídico nem documentos prontos para uso.

O catálogo é gerenciado em `/platform/plans`, acessível exclusivamente aos e-mails em `BILLING_ADMIN_EMAILS` (lista separada por vírgulas). Planos sem preço não permitem checkout. Ajuste `BILLING_TRIAL_DAYS`, `BILLING_TRIAL_PRODUCT_LIMIT` e `BILLING_TRIAL_MEMBER_LIMIT` antes de abrir o cadastro.

Para cobrança, configure `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET` com credenciais do ambiente correto. Aponte as notificações de pré-aprovação para `POST /api/webhooks/mercadopago`. O webhook valida HMAC, consulta a assinatura diretamente no Mercado Pago e aplica alterações de forma idempotente. O checkout é criado com chave de idempotência; alteração de valor em assinatura ativa aplica o preço novo na próxima cobrança, e o cancelamento é imediato.

`/billing` mostra consumo e limites de produtos/assentos. Convites são enviados pelo Resend, expiram em sete dias e respeitam o limite de membros. Alterar papéis administrativos e remover membros exige o papel de proprietário. A integração precisa ser homologada em sandbox antes de trocar as credenciais por produção; esta configuração local não comprova uma cobrança real.
