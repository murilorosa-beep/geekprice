# GeekPrice — fechamento dos bloqueadores pós-auditoria

**Data:** 14/10/2026 (America/Sao_Paulo)  
**Escopo:** correções e validações de segurança, build, integração e E2E. Não houve migration, alteração de credencial comercial, deploy, push, worker ou nova funcionalidade.

## Resumo de decisão

| Área | Estado | Evidência / motivo |
|---|---|---|
| Build | **aprovado** | `npm run build` terminou com exit code 0 fora do OneDrive: Next.js 16.4.0, TypeScript concluído e 71/71 páginas estáticas geradas. |
| Integração PostgreSQL | **aprovada** | Trava executada antes da suíte; 2 arquivos, **35 aprovados**, 0 reprovados, 0 ignorados, 304,43 s. |
| E2E Chromium | **reprovado / inconclusivo** | O browser foi instalado, mas o runtime Next local não demonstrou uso efetivo do banco isolado; a jornada foi interrompida no login antes de qualquer fluxo de negócio. |
| Segurança de credenciais (OPS-02) | **pendente** | `session_version=0`; Argon2 e `updated_at` não são prova de rotação posterior nem de invalidação de sessões. |
| SEC-01 | **aprovado** | Promoção limitada a `userId` + `organizationId`; regressões multi-membership: 3/3 aprovadas. |
| Git | **pendente** | `main` está 3 commits à frente de `origin/main` e há mudanças locais não enviadas para revisão/commit. |
| Railway staging | **bloqueado** | Exige OPS-02 resolvido e E2E repetido com runtime comprovadamente isolado. |

## SEC-01 corrigido

`scripts/create-master-admin.ts` não promove mais memberships por `userId` isoladamente. A regra em `src/server/admin/master-admin-membership.ts` busca, cria ou promove somente a membership da organização **GeekPrice Admin**, sempre filtrando por `userId` e `organizationId`.

Isso preserva memberships em lojas diferentes, inclusive em contas administrativas multiempresa. Os testes em `src/server/admin/master-admin-membership.test.ts` cobrem promoção do alvo, preservação de owner existente e criação exclusiva na organização administrativa. A suíte unitária anterior ficou em 27 arquivos e 113 testes aprovados.

## Build no Windows / OneDrive

No checkout original, `npm run build` falhou antes da compilação com `EPERM` ao remover `.next/node_modules`. A investigação encontrou `.next` como artefato gerado do GeekPrice, com atributos Windows de read-only/reparse point, enquanto o OneDrive estava ativo. Não havia processo Next/Vitest do projeto identificável antes da tentativa; nenhum processo foi encerrado indiscriminadamente e `.next` não foi apagado.

O projeto foi copiado para diretório temporário seguro fora do OneDrive, sem `.env`, `.env.phase81`, arquivos de senha administrativa ou backups. Nesse local, o mesmo build concluiu com sucesso (exit code 0). Portanto, o bloqueio observado é de filesystem/sincronização Windows/OneDrive sobre artefato gerado, não de TypeScript, rotas ou código da aplicação.

## Integração PostgreSQL

A trava `scripts/assert-isolated-test-environment.mjs` foi executada antes do Vitest. Ela confirmou o banco `geekprice_phase81_test_1791978720676`, distinto de `postgres`, no host pooler configurado e com URLs de execução/migração apontando ao mesmo destino isolado. Não foram impressas connection strings.

Resultado completo de `npm run test:integration`:

| Métrica | Resultado |
|---|---:|
| Arquivos de teste | 2 aprovados |
| Testes | 35 aprovados |
| Reprovados | 0 |
| Ignorados | 0 |
| Duração | 304,43 s |

A suíte incluiu autenticação e rate limiting, permissões/multi-organização, estoque, importação BRL e CSV, precificação, aprovação, histórico, rollback, isolamento de dados e cenários de worker/commerce. Não foram aplicadas migrations.

## E2E Chromium: bloqueio de isolamento efetivo

O Chromium do Playwright foi instalado localmente e o launcher de validação validou previamente o nome do banco isolado. A execução usou somente usuários e organizações sintéticos. Contudo, no passo de login, o callback retornou 401 e a sessão não trouxe `organizationId`.

Uma verificação de leitura confirmou que o usuário sintético, sua membership e sua senha de teste eram válidos no banco isolado, mas não havia registro de tentativa de login nesse banco. Também não havia registro correspondente no banco não isolado. Logo, o runtime Next não provou utilizar o destino isolado de forma efetiva; a causa precisa ser investigada (carregamento/precedência das variáveis de ambiente do processo Next ou falha de conexão do runtime) antes de repetir a jornada.

O servidor local iniciado para a validação foi encerrado pelo PID conhecido, sem atingir outros processos. Não é seguro considerar como aprovados login, dashboard, produto, Pokémon, estoque, CSV, custos/preços, margem, recomendações, aprovação, histórico, rollback, restauração ou acesso entre organizações nesta rodada. A suíte de integração já cobriu o isolamento entre organizações; a confirmação equivalente no navegador continua pendente.

## OPS-02 — credenciais administrativas

A inspeção read-only (`npm run admin:inspect-security`) encontrou a conta administrativa ativa, com e-mail verificado, hash Argon2 e `session_version=0`. O metadado `updated_at` observado em 14/10/2026 não demonstra que a senha anteriormente exposta deixou de funcionar; Argon2 tampouco é prova de rotação. Não foram exibidos senha, hash, token, e-mail ou connection string.

Para encerrar OPS-02, mediante autorização explícita para o banco comercial:

1. gerar a nova senha em cofre/secret manager e fornecê-la ao processo por `NEW_ADMIN_PASSWORD`, sem terminal, commit ou log;
2. executar o fluxo controlado `npm run admin:rotate`, que troca o hash e incrementa `sessionVersion` na mesma transação, além de desativar `admin@teste.com` e limpar tentativas de login residuais;
3. validar com uma sessão antiga previamente emitida que ela recebe 401/expiração, e validar novo login com a nova senha;
4. registrar no cofre/runbook apenas data, responsável e identificador não reversível; rotacionar também `NEXTAUTH_SECRET`, URLs/senhas de banco e chaves de integração se estavam no escopo da exposição.

Nenhuma dessas alterações foi realizada.

## Estado do Git

- Branch: `main`.
- Divergência: `origin/main...HEAD = 0 atrás / 3 à frente`.
- Commits locais ainda não confirmados no GitHub:
  - `0ad0a98` — endurecimento de cotações BRL/autopilot;
  - `73fd239` — documentação de prontidão;
  - `3afc208` — provisionamento administrativo, sessões e TLS.
- Mudanças atuais: SEC-01, trava de ambiente isolado, inspeção read-only de segurança, três relatórios e `next-env.d.ts` regenerado pelo Next em modo dev.
- `next-env.d.ts` passou a referenciar `.next/dev`; revisar/reverter de modo controlado antes do commit caso o build de produção seja o estado desejado.
- `.env`, `.env.phase81`, arquivos `.admin-*.local` e `backups/` permanecem ignorados; não estão rastreados. A inspeção de nomes/diff não encontrou segredo versionado.

Não houve commit, push, force-push ou deploy nesta etapa.

## Pendências para staging isolado no Railway

1. Corrigir e demonstrar a injeção efetiva do ambiente de teste no processo Next/Playwright; adicionar uma verificação runtime que reporte somente host, porta e nome do banco, e então repetir a jornada E2E completa, incluindo acesso negado entre organizações.
2. Autorizar e concluir OPS-02, comprovando tanto a troca da senha como a invalidação de sessões antigas.
3. Revisar as mudanças locais, especialmente `next-env.d.ts`, e enviar os commits por processo humano aprovado antes de vincular um deploy.
4. No host Windows, manter `.next` fora da árvore sincronizada ou excluir esse artefato de sincronização para evitar a recorrência de `EPERM`.

**Conclusão:** o build, SEC-01 e a integração isolada estão aprovados. O sistema ainda não está liberado para configurar staging no Railway porque E2E isolado e OPS-02 continuam bloqueadores.
