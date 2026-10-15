# GeekPrice — auditoria independente

**Data:** 14/10/2026 (America/Sao_Paulo)  
**Escopo:** revisão estática, Git, configuração sem revelar segredos, banco comercial em transação somente leitura e verificações locais. Não houve migrations, escrita no banco, scraping, deploy ou criação de usuários.

## 1. Resumo executivo

**Veredito: B — QUASE PRONTO para beta privado assistido, condicionado às correções P1 abaixo e a uma configuração de produção validada.**

O núcleo que interessa ao beta — login, isolamento lógico por organização, inventário, CSV, regras de preço, recomendações, aprovação manual e rollback — é substancial e tem boa evidência automatizada. O banco comercial está na migration `0013`; o código atual compila e 110 testes unitários passam.

Não é uma homologação ponta a ponta do ambiente comercial: os testes de integração escrevem dados e não foram executados, porque `.env` aponta para o banco comercial `postgres`. Também não foi possível comprovar convite/e-mail real, fontes BRL, WooCommerce ou pagamentos. A principal condição operacional é que a `main` local está **3 commits à frente de `origin/main`**: um deploy a partir do GitHub não conterá as correções recentes até que o responsável as publique conscientemente.

## 2. Estado real do repositório

| Item | Evidência |
|---|---|
| Branch/árvore | `main`, limpa (`git status --short` sem saída) |
| Remoto | `origin` é GitHub; `origin/main...HEAD = 0 3` (3 commits apenas locais) |
| Commits informados | `56a468d`, `0ad0a98`, `73fd239` e `3afc208` presentes na `main` local |
| Stack resolvida | Next 16.4.0 (build), React 19 via lockfile, TS estrito, Drizzle/postgres-js, NextAuth v4, Argon2, Zod, Decimal, Vitest/Playwright |
| Artefatos locais sensíveis | `.env`, `.admin-*.local` e `backups/` estão ignorados; não estão rastreados |
| Build | compilação Turbopack e etapa TypeScript iniciadas sem erro; `BUILD_ID` foi gerado. A captura não trouxe a linha terminal de sucesso, portanto não trato o build como homologação integral nesta auditoria. |

Há documentação rica, mas partes de `PROJECT_STATUS.md` são historicamente contraditórias (por exemplo, afirma que o comercial ficou em `0012`, enquanto a inspeção atual prova `0013`). A inspeção atual prevalece.

## 3. Arquitetura

Next App Router concentra páginas em `src/app`, APIs em `src/app/api`, regras de negócio em `src/server`, e schema/cliente em `src/db`. É uma separação razoável para o porte atual. As APIs usam Zod e `requireOrganization()`; serviços recebem `organizationId` derivado da sessão, não do corpo HTTP. Há transações, locks consultivos e índices em fluxos de importação e Autopilot.

O custo da arquitetura é alto para um beta: planos, pagamentos, cupons, webhooks, integração comercial persistida, worker distribuído, fencing e Scrydex coexistem com o núcleo. Eles não impedem o MVP, mas aumentam a superfície de manutenção. Para o beta, mantenha pagamentos, cron e scraping desabilitados.

## 4. Banco Supabase

A conexão inspecionada usa pooler Supabase, host `aws-0-us-east-1.pooler.supabase.com`, banco `postgres`, papel `postgres`, PostgreSQL 17.11. O cliente validou TLS 1.3 com certificado autorizado. `pg_stat_ssl` mostra `ssl=false` no salto pooler→Postgres; isto não contradiz o TLS cliente→pooler, mas não prova criptografia nesse salto interno.

Foram encontradas **34 tabelas** (incluindo `drizzle.__drizzle_migrations`): identidade/multiempresa (`users`, `organizations`, `memberships`), inventário/catálogo/mercado, recomendações/Autopilot, billing, convites e integrações. As 14 migrations `0000`–`0013` estão registradas, com hashes correspondentes ao repositório.

`0013_distributed_integrity.sql` está aplicada e contém `commerce_previews`, `autopilot_worker_state`, versão de fencing, lease, chave de idempotência composta e os índices esperados. RLS está habilitada e as roles `anon`/`authenticated` tiveram acesso revogado nas migrations. Isto protege a Data API, não o servidor: o backend usa o papel `postgres`, que é privilegiado e pode contornar RLS; a segurança efetiva depende dos filtros de aplicação.

Não foram inspecionadas políticas de backup, retenção, restore, métricas de conexões ou conteúdo comercial além do catálogo do schema. Há backup local documentado, mas restore não foi ensaiado.

## 5. Segurança

Controles confirmados: Argon2id com upgrade de bcrypt, sessão JWT de 8 h e `sessionVersion`, tokens de ação hashados/uso único, rate limiting persistente, papéis revalidados no banco, URLs WooCommerce HTTPS com defesa SSRF/DNS pinning, AES-256-GCM para credenciais, HMAC de previews e cotações e limites de resposta WooCommerce.

Limitações: há fallback HMAC fixo em desenvolvimento em `src/server/market/brazilian-sources.ts:73-80`; não entra em produção se `NEXTAUTH_SECRET` estiver configurado, mas torna não confiável o ambiente de desenvolvimento para teste de integridade de cotação. Falta CSP em `next.config.ts:3-12`, embora os cabeçalhos básicos estejam presentes. O papel `postgres` tem `rolcreatedb=true`, não é superuser e representa blast radius elevado se a aplicação for comprometida.

### Problemas

| ID | Pri. | Problema e evidência | Impacto / reprodução segura | Correção | Beta |
|---|---|---|---|---|---|
| SEC-01 | P1 | `scripts/create-master-admin.ts:133-142` busca membership só por `userId` e, se não for owner, faz `UPDATE` também só por `userId`. | Executar o script para uma conta com memberships em duas lojas a promove a `owner` em todas elas. Não executar no comercial. | Sempre filtrar pelo `organizationId` da organização administrativa; recusar conta multiempresa ou tornar a escolha explícita. Teste de regressão. | Bloqueia uso do script em produção até corrigir. |
| OPS-01 | P1 | `main` está 3 commits à frente de `origin/main`; inclui `3afc208`. | Deploy conectado ao GitHub usa versão anterior, potencialmente sem hardening recente. | Revisar diff e publicar por processo humano aprovado; confirmar SHA no Railway. | Bloqueia deploy GitHub seguro. |
| SEC-02 | P2 | Backend conectado como `postgres`; RLS não é uma barreira para esse papel. | Uma falha de autorização em serviço pode alcançar dados de outra loja. As rotas revisadas fazem escopo, mas isto não é defesa em profundidade. | Papel de runtime com grants mínimos e RLS forçada/políticas adequadas, ou documentar e testar rigorosamente esse boundary. | Não bloqueia beta assistido. |
| SEC-03 | P2 | Sem CSP em `next.config.ts`. | Aumenta impacto de eventual XSS em conteúdo futuro/externalizado. | CSP nonce-based compatível com Next, após teste de UI. | Não. |
| SEC-04 | P2 | Fallback HMAC conhecido em `brazilian-sources.ts:73-80`. | Em desenvolvimento sem segredo, uma cotação pode ser forjada; produção sem segredo falha fechada. | Remover fallback ou permitir só quando `APP_ENV=test`, com segredo aleatório em dev. | Não para produção configurada. |
| OPS-02 | P2 | Rotação administrativa: código e arquivo local indicam mecanismo, não execução comprovada. | Não se pode afirmar que segredo exposto historicamente deixou de ser válido. | Rotacionar sob procedimento autorizado e registrar apenas data/operador/fingerprint, nunca a senha. | Sim, se houve exposição real não resolvida. |

Não achei uma IDOR confirmada nas rotas principais revisadas: inventário, alertas, importação, mercado, Autopilot e integração recebem o escopo da sessão e os serviços filtram por organização. Isso não substitui testes de rota completos para todas as APIs.

## 6. Matriz de funcionalidades

| Módulo | Estado atual | Limite de evidência |
|---|---|---|
| Login/logout, senha, sessão | Implementado e validado por unidade | E2E atual não reexecutado |
| Usuários/equipe/convites | Implementado, dependente de Resend e configuração legal | e-mail real não homologado |
| Dashboard | Implementado com dados/empty states | UX atual não validada em navegador nesta auditoria |
| Produtos/estoque/CSV | Implementado e coberto por unidade | integração PostgreSQL atual não executada |
| Pokémon/Magic | Implementado, dependente dos provedores | disponibilidade/termos externos não homologados |
| Mercado BRL | Parcial e seguro por padrão | scraping desabilitado; anúncio não é venda comprovada |
| Precificação/recomendações | Implementado e bem testado | qualidade depende da referência inserida |
| Autopilot | Implementado, revisão/manual e rollback existem | worker/cron não homologados agora; mantenha desligado |
| WooCommerce | Implementado read-only no código | sem conexão real homologada |
| Mercado Pago | Preparado, não necessário ao beta | sem credenciais/homologação |
| Planos/trial | Implementado | trial expira e vira read-only; precisa plano beta explícito |

## 7. Inteligência de preços e Autopilot

`src/lib/pricing.ts` usa Decimal, bloqueia denominadores inválidos, arredonda sem romper o piso e sinaliza ausência de custo, preço atual, referência, margem e oscilações. Cotações não homologadas acionam `unverified_market_reference`, bloqueando autoaplicação. Aplicação de lote e rollback têm histórico, transação, idempotência e fencing/lease no worker.

Isso não transforma anúncios em vendas realizadas: `price_type` diferencia listing/completed_sale/reference, mas a qualidade comercial depende da origem e metadados. A coleta Liga é HTML parsing, cache de 15 minutos e feature flag; não há prova de autorização de uso comercial. Portanto não é fonte homologada e não deve acionar preço automático.

## 8. Integrações e UX

WooCommerce não escreve na loja; faz GET, bloqueia redirecionamentos, portas não-443, IPv4 privado e respostas >5 MB. Preview é persistido e consumido transacionalmente. Há risco residual de mudanças no IPv6/DNS não cobertas pelo resolvedor IPv4 e falta de homologação com loja real.

Não houve navegador isolado nesta auditoria; não declaro UX/mobile/acessibilidade homologados. O produto expõe muitos módulos para um beta. Priorize Produtos, Mercado, Recomendações, Autopilot manual, Configurações e Equipe; esconda cobrança, integrações e automação até configuradas.

## 9. Testes e desempenho

Executados: `npm run typecheck` passou; `npm run lint` passou; `npm test` passou com **26 arquivos / 110 testes**. Vitest alertou que `vitest.config.ts` tem sintaxe ESM carregada como CommonJS no futuro modo nativo. Os testes de integração foram corretamente **não executados**: o alvo configurado é o banco comercial. A evidência histórica de integração é útil, não substitui a execução atual no banco isolado.

Principais riscos de escala: importação síncrona de até 2.000 linhas; chamadas externas síncronas de 8 s; cache BRL em memória por instância; consultas de dashboard/recomendações/histórico que crescerão com observações; e pool por instância (máx. 3) em múltiplas réplicas. Não há benchmark novo, portanto não há números de desempenho.

## 10. Railway e beta gratuito

O build usa `next build`, start `next start` e Next respeita `PORT`; não há health endpoint explícito nem graceful shutdown explícito. Railway precisa de `NODE_ENV=production`, `APP_ENV=production`, URL pública de NextAuth, `NEXTAUTH_SECRET`, `DATABASE_URL` TLS, CA acessível ou bundle, pool pequeno, e `INTEGRATION_ENCRYPTION_KEY` somente se integração for usada. `COMMERCE_PREVIEW_SIGNING_KEY` é recomendada; sem ela usa `NEXTAUTH_SECRET`. O filesystem é efêmero: não use para credenciais/backups/checkpoints.

Para 3–5 lojas sem cobrança: não habilite cadastro público; crie/convide somente após Resend e documentos legais aprovados, ou faça provisionamento assistido autorizado. Defina assinaturas `active` ou trial com data beta controlada; trial vencido vira `read_only`, portanto não use o padrão de 14 dias sem acompanhamento. Mercado Pago pode ficar totalmente ausente.

## 11. Conformidade

TCGdex/Scryfall/Liga/Mercado não foram juridicamente homologados nesta auditoria. A capacidade técnica de ler HTML/API não é licença comercial. Termos e privacidade estão explicitamente como drafts até aprovação; mantenha registro de versão, LGPD, exportação/eliminação e contratos de fonte como pendências antes de abertura pública.

## 12. Respostas objetivas

1. **Funcional?** Sim no núcleo, com evidência automatizada; não integralmente homologado em produção.
2. **100% utilizáveis hoje?** Inventário, CSV, cálculo/recomendação e aprovação/rollback, sujeitos à configuração de acesso.
3. **Apenas parecem prontas?** Pagamento, e-mail real, WooCommerce real, scraping BRL, cron e UX mobile.
4. **Riscos novos?** SEC-01, papel runtime privilegiado e divergência local/remoto.
5. **Risco entre lojas?** Não confirmado nas rotas analisadas; SEC-01 cria elevação multiempresa via script.
6. **Autopilot indevido?** A trava reduz muito o risco; mantenha cron desligado até homologação e fontes confiáveis.
7. **BRL confiável?** Integridade de transporte boa; confiabilidade comercial/jurídica não comprovada.
8. **Supabase adequado?** Sim como base, mas runtime `postgres` não oferece contenção por RLS.
9. **Reescrita urgente?** Não; correção cirúrgica de SEC-01 e configuração/deploy primeiro.
10. **Complexo?** Sim, acima do necessário para beta, mas o núcleo pode operar com extras desabilitados.
11. **Gargalos?** Os cinco de escala listados acima.
12. **Testes provam tudo?** Não; provam 110 cenários unitários, não provedores/configuração reais.
13. **Credenciais resolvidas?** Código melhorou; rotação efetiva não comprovada.
14. **Railway pronto?** Próximo, mas falta configuração, health check e SHA remoto.
15. **Publicar hoje?** Pode travar trial, rodar versão antiga e expor fluxo admin inseguro.
16. **Convidar 3 lojas sem cobrança?** Sim, após controlar assinatura/trial, e-mail e acesso.
17. **Mínimo seguro?** SEC-01, publicar SHA certo, checklist Railway/segredos e beta assistido sem cron/scraping/pagamento.
18. **Maior valor?** Estoque + piso rentável + recomendação explicável/rollback.
19. **Simplificar?** Ocultar billing, scraping, cron, WooCommerce e Scrydex do beta.
20. **Próximo passo?** Corrigir SEC-01 e abrir staging isolado para executar integração/E2E atual.

