# GeekPrice no Railway

Este roteiro prepara um piloto com cadastro público fechado. O código de cadastro, confirmação de e-mail, recuperação de senha e onboarding existe, mas o formulário público só abre quando o envio de e-mail está configurado e os documentos jurídicos publicados foram aprovados.

## 1. Serviços e banco

1. Crie um projeto no Railway e conecte o repositório GitHub `murilorosa-beep/geekprice`, branch `main`.
2. Use **um** PostgreSQL: o serviço PostgreSQL do Railway **ou** o Supabase atual. Não aponte o ambiente novo para o banco de desenvolvimento por engano.
3. Na aplicação, defina `DATABASE_URL`. Para Supabase com pooler, defina também `DATABASE_MIGRATION_URL` com a URI de sessão e `DATABASE_SSL_CA_PATH=certs/supabase-prod-ca-2021.crt`. Para PostgreSQL do Railway, use a variável de referência do serviço Postgres e deixe `DATABASE_SSL_CA_PATH` vazio.
4. Em **Settings → Deploy → Pre-deploy Command**, configure `npm run db:migrate`. Em **Healthcheck Path**, configure `/api/health`. O Railpack usa `npm run build` e `npm run start` do `package.json`.
5. Gere o domínio público em **Settings → Networking** e configure `NEXTAUTH_URL` com a URL HTTPS exata, sem barra final. Defina `NEXTAUTH_SECRET` com um valor aleatório longo. As variáveis entram no Railway, nunca no Git.

## 2. Primeiro acesso

Em um banco novo, as migrations criam o produto GeekPrice, mas **não** criam uma conta pessoal. Para um piloto com cadastro fechado, configure temporariamente `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` (senha com pelo menos 12 caracteres) no serviço e execute uma única vez, dentro do contêiner, `railway ssh -- npm run admin:create:railway`. Depois remova `ADMIN_PASSWORD` das variáveis do serviço. O login usa o e-mail completo; não existe usuário ou senha pessoal padrão no código publicado.

Se reutilizar o banco Supabase atual, os usuários e estoques existentes continuam nesse banco. O Git não apaga nem altera essas contas. Decida se o piloto deve usar esse banco antes de configurar `DATABASE_URL`.

## 3. Variáveis por recurso

| Recurso | Variáveis | Situação inicial |
| --- | --- | --- |
| Aplicação | `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Obrigatórias |
| Migrações Supabase | `DATABASE_MIGRATION_URL`, `DATABASE_SSL_CA_PATH` | Somente se usar Supabase |
| Busca de preço físico | `PKMNPRICES_API_KEY` | Opcional; preços em USD, sem alterar o estoque |
| Cadastro público e e-mails | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Necessárias antes de abrir cadastro |
| Termos e Privacidade | `LEGAL_DOCUMENTS_APPROVED`, `TERMS_VERSION`, `PRIVACY_VERSION` | Mantenha `false` e versões `draft` enquanto as páginas forem rascunhos |
| Assinaturas | `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` | Opcional; habilite após testar cobrança |
| Autopilot agendado | `CRON_SECRET` | Necessário só para chamar o cron protegido |

As páginas `/terms` e `/privacy` ainda contêm campos por preencher. Substitua o conteúdo, revise os documentos e só então altere as versões e `LEGAL_DOCUMENTS_APPROVED=true`. Apenas mudar a variável não torna os textos atuais adequados para cadastro público.

## 4. Conferência depois do deploy

1. Confirme que `https://SEU-DOMINIO/api/health` responde `{"status":"ok"}`.
2. Confira os logs da migração e o login com o e-mail do administrador configurado.
3. Abra Produtos e Mercado. Sem uma cotação brasileira verificada da mesma variante, o sistema deve mostrar ausência de cotação, não um preço fabricado.
4. Antes de convidar outras lojas, teste cadastro, entrega do e-mail, confirmação, onboarding, recuperação de senha e isolamento de estoque em um ambiente de teste com os provedores configurados.

Referência: [Railway — Next.js com Postgres](https://docs.railway.com/guides/nextjs) e [pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command).
