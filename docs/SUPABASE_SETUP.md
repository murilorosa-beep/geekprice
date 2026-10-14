# GeekPrice no Supabase

O backend mantém NextAuth, Drizzle e postgres-js. Supabase hospeda o PostgreSQL; a conexão SQL usa senha do banco, não chave publishable/secret da Data API. Não é necessário adicionar @supabase/server para essa conexão.

## Ambiente

O `.env` local foi configurado para o projeto `zmdweberkdminhqgyhgp`, com Session pooler `aws-0-us-east-1.pooler.supabase.com:5432`, banco `postgres` e usuário de pooler fornecido no painel. Senhas não são reproduzidas neste documento.

- `DATABASE_URL`: URI do pooler para a aplicação.
- `DATABASE_MIGRATION_URL`: conexão direta ou Session pooler para migrations/backup. Não usar Transaction pooler na porta 6543 nesses comandos.
- `DATABASE_SSL_CA_PATH=certs/supabase-prod-ca-2021.crt`: CA do Supabase, com hostname/certificado validados.
- `DATABASE_POOL_MAX=3`: limite por processo. Páginas e APIs compartilham um pool em produção; prepare=false permite usar Transaction pooler quando necessário.
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`: autenticação existente do GeekPrice.
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`: administrador inicial já configurado; não são as credenciais PostgreSQL.

A URI direta só anunciou IPv6; esta rede retornou ENETUNREACH. Por isso foi usado o Session pooler fornecido pelo usuário, sem inventar host/região. TLSv1.3 com authorized=true foi observado no cliente. pg_stat_ssl no PostgreSQL retorna ssl=false para a conexão interna pooler→PostgreSQL; isso não representa o TLS cliente→pooler.

A CA pública foi obtida por HTTPS de `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. SHA-256 do certificado: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`; validade até 26/04/2031. Em outro ambiente, forneça o arquivo/caminho; não desative a validação TLS.

## Uso

```powershell
npm.cmd run db:inspect
npm.cmd run start
```

O servidor principal foi iniciado em `http://127.0.0.1:3000`. O inicializador Windows reconhece banco remoto sem exigir Docker e não aplica migrations nem seed remoto automaticamente.

As migrations 0000–0012 foram testadas em banco exclusivo, aplicadas ao principal após backup e verificadas pelo histórico real. O seed criou somente organização, administrador, política e assinatura iniciais usando o `.env`; nenhum produto ou referência sintética foi inserido no principal.

0012 habilita RLS e revoga privilégios dos papéis anon/authenticated nas 31 tabelas da aplicação. Não há políticas Supabase Auth: autenticação/membership continuam no backend NextAuth. Clientes da Data API não devem consultar essas tabelas diretamente. O usuário PostgreSQL proprietário continua tendo acesso do backend, por isso os filtros de organização nos serviços seguem necessários.

## Backup

```powershell
npm.cmd run db:backup
```

Exige pg_dump/pg_restore em `.tools/pgsql/bin`, ou caminho definido por POSTGRES_BIN_DIR. Foram baixados binários oficiais EDB PostgreSQL 17.11 para `.tools`, sem instalar serviço local. Dumps custom atualizados, tamanho, SHA-256, metadata JSON, leitura do catálogo e decodificação integral ficam em `backups`, com padrões ignorados pelo Git.

O backup lógico usa --no-owner/--no-acl. Objetos físicos do Storage, infraestrutura Supabase, proprietários e grants não são restaurados por esse arquivo. A restauração verificada cobre public/drizzle e os dados do GeekPrice, não todo o serviço Supabase.

## Validação isolada

`.env.phase81` contém exclusivamente a URI do banco de testes no mesmo projeto Supabase. Não copie essa URI para a aplicação principal.

```powershell
npm.cmd run test:integration
node scripts/start-validation-server.mjs --production
node scripts/verify-phase81-http.mjs
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.tools\playwright'
node scripts/verify-phase81-browser.mjs
node --env-file=.env --env-file=.env.phase81 scripts/verify-phase81-restore.mjs
```

Execute integração antes de HTTP/navegador para gerar os usuários sintéticos. O servidor de validação usa a porta 3108. Chromium foi instalado em `.tools/playwright`. Os testes recusam um destino que não corresponda ao banco explicitamente nomeado geekprice_phase81_test. Nenhum teste de escrita usa o banco postgres principal.

Resultados e screenshots ficam em `.tools`, ignorada. Bancos de teste/restauração foram mantidos para inspeção; são separados do principal. A ferramenta prepare-supabase-validation não deve ser usada para sobrescrever um teste já preenchido.

Snapshots 0007–0012 foram reconstruídos reproduzindo os SQLs em PostgreSQL isolado e introspectando cada estado com Drizzle Kit 0.31.11. Os arquivos brutos e a comprovação ficam em .tools. `npm.cmd run db:check`, `drizzle-kit check` e `db:generate` passaram sem diferença de schema. O replay também preservou registros sintéticos criados antes de 0007, inclusive histórico, estoque, ID canônico e backfills.

O proxy local foi validado por HTTP real com o backend em loopback: substitui X-Forwarded-For pelo IP do socket e impede que cabeçalhos rotativos criem novas origens. Para repetir: inicie `node scripts/start-validation-server.mjs --production --trusted-proxy` e execute `node --env-file=.env --env-file=.env.phase81 scripts/verify-trusted-proxy.mjs`. Isso valida a topologia local; um futuro deploy requer a mesma restrição de acesso direto. O principal mantém o comportamento sem proxy por padrão.

O administrador não pode usar importação privada CSV para gravar em fontes desativadas, verificadas ou parceiras protegidas. Fontes compartilhadas continuam separadas por escopo; fixtures sintéticas usam banco exclusivo. A concorrência pública é limitada por upsert atômico; Autopilot aborta se custo/preço mudam durante aprovação.

A auditoria de produção retornou zero avisos. Restam cinco avisos altos na cadeia de desenvolvimento ESLint/braces, sem versão corrigida publicada: os globs vêm da configuração local confiável, não de requisições HTTP. Quatro avisos moderados do esbuild antigo foram removidos com override transitivo. Não foi usado audit fix --force ou downgrade do Next.js.

Referências: [conexão PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [Drizzle](https://supabase.com/docs/guides/database/drizzle), [certificados SSL](https://supabase.com/docs/guides/platform/ssl-enforcement).
