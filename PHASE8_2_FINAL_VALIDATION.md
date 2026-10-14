# GeekPrice — Fase 8.2: fechamento técnico e validação final

Data: 14/10/2026 (America/Sao_Paulo). Ambiente principal: Supabase PostgreSQL 17.11. Testes de escrita: banco exclusivo `geekprice_phase81_test_1791978720676` no mesmo projeto Supabase. Este relatório registra o que foi executado nesta fase; resultados da Fase 8.1 são contexto histórico.

**Conclusão:** os fluxos críticos de estoque multiempresa, referências BRL, recomendação, aprovação supervisionada, auditoria e rollback foram verificados em PostgreSQL real, HTTP e Chromium. Não há autorização ou evidência para declarar pronto um deploy comercial externo: os pontos de infraestrutura e procedência de dados da seção 11 continuam condicionantes da Fase 9. Nenhum preço ou cotação comercial foi alterado.

## 1. Git e proteção dos arquivos

- O diretório não possuía `.git`. Foi inicializado um repositório **local**, sem remoto, publicação ou push.
- `.gitignore` foi ampliado para todos os `.env.*` (mantendo `.env.example`), `backups/`, `.tools/`, builds, logs e formatos comuns de chave privada. `git check-ignore` confirmou que `.env`, `.env.phase81`, dumps, SQLs de backup e fixtures estão excluídos.
- Busca por padrões de chaves privadas, URIs PostgreSQL com senha e tokens de produção entre os arquivos candidatos ao Git não encontrou credenciais reais. O exemplo local em `vitest.config.ts` usa usuário/senha demonstrativos.
- O bundle público `.next/static` foi inspecionado em 30 arquivos: não contém os valores atuais de `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `NEXTAUTH_SECRET` nem `SEED_ADMIN_PASSWORD`. O código cliente não usa credenciais privilegiadas do Supabase.
- Os arquivos anteriores foram preservados. O Git local é um ponto de partida para versionamento; publicação exige decisão separada.

## 2. Dados anteriores à migração

- `backups/pre-phase8-backup.sql` e `backups/pre-optimization-phase1.sql` são cópias idênticas (155.602 bytes, UTF-16LE) de um dump PostgreSQL 17.11 anterior: 10 registros de migration, uma organização, um usuário, um membership e **zero** produtos, itens de estoque ou observações de preço.
- O Supabase principal tem uma organização, um usuário e zero itens/cotações. Os IDs de organização e usuário **diferem** dos IDs do dump local; portanto, não se deve presumir que o seed novo recuperou aquela conta.
- O banco citado como estando em outro computador não foi disponibilizado. Não é possível afirmar se ele contém outros dados; não houve importação ou sobrescrita. Antes de migrar qualquer conta antiga, identificar sua origem, titularidade e conflitos de identidade em restauração isolada.

## 3. Segurança do Supabase

- Conexão com CA Supabase validada; a verificação anterior observou `TLSv1.3` e `authorized=true`. A inspeção atual recusaria certificado inválido. Aplicação com pool de até três conexões por processo.
- `public` contém 31 tabelas, todas com RLS habilitado. Nenhuma concessão de tabela foi encontrada para `anon` ou `authenticated`. GET anônimo real da Data API em `/rest/v1/users?select=id&limit=1` respondeu **401 / PostgreSQL 42501**.
- 44 chaves estrangeiras estão validadas; nenhuma constraint FK pendente. Os índices `inventory_org_sku_uidx`, `product_variants_sku_idx`, `alerts_org_created_idx` e `price_observations_currency_region_idx` existem; o antigo índice global único de SKU não existe.
- O backend usa usuário PostgreSQL proprietário. RLS da Data API não substitui filtros por organização nos serviços; o isolamento desses serviços foi testado em banco real.
- Inspeção reproduzível: `node --env-file=.env scripts/inspect-phase82-security.mjs`. Ela consulta o principal somente em transação `read only` e não imprime IDs, senhas ou registros pessoais.

## 4. Integridade das migrations

- As 13 migrations `0000`–`0012` constam no histórico real `drizzle.__drizzle_migrations`, em ordem, com timestamps e SHA-256 idênticos aos arquivos locais. Nenhuma migration foi executada no principal nesta fase.
- Os snapshots já haviam sido reconciliados em banco exclusivo na Fase 8.1; a evidência preservada em `.tools/phase81-snapshot-drift.json` indica cadeia válida e sem divergência de schema. A verificação atual confirmou journal, hashes, índices e constraints aplicados.
- O backup mais recente do principal antes desta fase permanece `backups/supabase-2026-10-14T12-19-18-527Z.dump` (397.243 bytes, SHA-256 `6ac66e2d6d1e82736eefb2832ca28b3ad6a3e174857f7c26d0b50c8d2180f5ae`). Catálogo e decodificação foram verificados na Fase 8.1. Não houve migration ou escrita no principal que exigisse novo backup aqui.

## 5. Autopilot supervisionado

- No banco isolado, custo R$ 60, taxa 10%, custo adicional 5% e margem mínima 20% produziram piso **R$ 92,31**. A recomendação persistida respeitou o piso independente e a margem desejada.
- O Chromium criou item sintético, importou BRL, abriu Recomendações, aprovou ajuste pela interface, verificou preço alterado no inventário e reverteu pela interface. O preço inicial R$ 110 foi restaurado. Sem `pageerror`.
- A integração PostgreSQL verificou trilha de auditoria, preço anterior/novo/mínimo, permissão e isolamento entre lojas; uma mudança concorrente no custo abortou a transação sem preço nem auditoria parcial.
- Corrigido lote de aprovação sem alteração real. Aprovação repetida retorna HTTP **400** sem novo histórico. Rollback repetido retorna **409**; rollback de outra organização retorna **404**. Os fluxos HTTP reais confirmaram os códigos.

## 6. Worker e cron

- O worker percorre organizações e os canais `counter`, `ecommerce` e `marketplace` sequencialmente. Apenas `counter` pode aplicar preço, e somente quando uma regra ativa tem `autoApplySafe=true`. A integração real confirmou nenhum ajuste com opção desligada e um ajuste auditado após ativação explícita no banco sintético.
- Adicionado bloqueio distribuído por sessão PostgreSQL mais guarda no processo. Dois ciclos não podem rodar ao mesmo tempo; a integração segurou o lock em outra sessão e recebeu `AutopilotBusyError`. A rota cron devolve **409** nesse caso.
- A rota aceita apenas POST com Bearer secret de 32+ caracteres. Teste HTTP isolado: GET **405**, ausente/incorreto **401**, ciclo concorrente **409**, dois ciclos autorizados **200**. O segundo não criou lote adicional. Evidência: `.tools/phase82-cron-results.json`.
- Erro de persistência de alerta não é mais silenciosamente ignorado. A rota registra erro e devolve 500; o worker CLI em execução única sinaliza saída diferente de zero. Logs incluem contagens de organizações/itens/lotes, sem credenciais.
- O cron não foi habilitado no principal. No teste, 22 organizações sintéticas foram percorridas; os dois ciclos HTTP aplicaram zero preços porque não havia nova alteração elegível. O teste de integração é a evidência da aplicação automática positiva.
- **Limite operacional:** não há paginação/cota de organizações ou itens por ciclo nem medição de carga prolongada. Não ativar agendamento produtivo até definir orçamento de execução, observabilidade e comportamento de retomada para o ambiente de hospedagem escolhido.

## 7. Proxy e autenticação

- `TRUSTED_PROXY_HOPS` não foi configurado para a instalação principal; sem topologia conhecida, cabeçalhos enviados pelo cliente não são confiados para origem do login.
- A topologia local de prova usa backend restrito a loopback e proxy que substitui `X-Forwarded-For` pelo peer TCP. Teste HTTP atual aprovou login, cinco falhas com cabeçalhos rotativos sem bypass, hash de origem igual ao peer e recuperação após expiração simulada. Evidência: `.tools/phase81-proxy-results.json`.
- A integração testou tentativas distribuídas, simultâneas e recuperação no PostgreSQL. Um atacante ainda pode provocar bloqueio temporário de uma conta legítima mediante falhas repetidas; monitoramento e política de mitigação devem ser avaliados no deploy.
- Um deploy externo só pode configurar `TRUSTED_PROXY_HOPS` após confirmar número de saltos, substituição dos headers pelo proxy e impossibilidade de acesso direto ao backend. Essa infraestrutura ainda não existe para homologação fim a fim.

## 8. Qualidade das referências BRL

- CSV de cada loja cria fonte `private`, `verified=false`; nome declarado no arquivo não concede acesso a fonte compartilhada, parceira, verificada ou de outra loja. Integração real testou esses bloqueios e a ausência de influência cruzada mesmo com variante canônica compartilhada.
- Observações retêm `priceType` (`listing`, `completed_sale`, `reference`), mas os tipos de anúncio e venda enviados por lojista são **declarações não verificadas**. A API e a tela Mercado agora agrupam por fonte e tipo, com rótulo de procedência; não misturam os três tipos na mesma estatística exibida.
- A precificação e o histórico do Dashboard usam apenas observações `reference` em BRL/BR. A precificação ignora referências com mais de 30 dias. Teste PostgreSQL confirmou que uma cotação vencida deixa `marketPrice=null` e que anúncio não altera a média de precificação.
- Cotações sintéticas continuam apenas no banco de teste. No principal há zero produtos, zero observações e zero fontes. Ainda não há origem brasileira independente homologada; uma loja pode fornecer referência falsa para influenciar **sua própria** recomendação, mas não a de outra loja. Verificação externa de proveniência permanece requisito de produto para a Fase 9.

## 9. Dependências

- `npm audit --json` atual: **5 avisos altos**, todos na cadeia de desenvolvimento `eslint-config-next@16.4.0` → `@next/eslint-plugin-next@16.4.0` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`. É um único advisory propagado: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), exaustão de pilha por padrões profundamente aninhados. O advisory informa que não há versão corrigida de `braces` até a data da consulta.
- `npm audit --omit=dev --json`: **zero avisos** para dependências de produção. Não há passagem conhecida de padrões de glob fornecidos por usuários HTTP para essa cadeia; o risco observado está nas ferramentas de lint durante desenvolvimento/CI. Isso não prova ausência de todas as vulnerabilidades possíveis.
- O npm sugere downgrade major de `eslint-config-next` para 14.2.35, incompatível com o Next.js 16 desta aplicação; nenhuma atualização automática ou `audit fix --force` foi executada. Quatro avisos moderados antigos de `esbuild` já não aparecem no audit atual.

## 10. Testes atuais

| Categoria | Resultado desta fase |
| --- | --- |
| Typecheck | `npm.cmd run typecheck` passou |
| Lint | `npm.cmd run lint`: zero erros, dois avisos preexistentes de navegação interna |
| Unitários | `npm.cmd test`: 19 arquivos, **67/67** aprovados |
| Build | `npm.cmd run build`: 65 rotas geradas, TypeScript aprovado |
| Integração PostgreSQL | **22/22** aprovados em banco isolado após as correções de Autopilot, freshness e lock; cenário específico de separação por tipo e cotação vencida repetido após o ajuste final |
| HTTP | **7 fluxos** aprovados, incluindo importação, assinatura de preview, aprovação/rollback e rejeições duplicadas; `.tools/phase81-http-results.json` |
| Chromium | **13 verificações** aprovadas no banco isolado; `.tools/phase81-browser-results.json` e `.tools/phase81-dashboard.png` |
| Cron | Método, autenticação, concorrência e duas execuções autorizadas aprovados; `.tools/phase82-cron-results.json` |
| Proxy | Cabeçalhos forjados, bloqueio e recuperação aprovados com proxy HTTP local; `.tools/phase81-proxy-results.json` |
| Principal | Auditoria SQL/Data API somente leitura: 31 RLS, zero grants aos papéis públicos, 44 FKs válidas; zero produtos/cotações |

Resultados herdados: os testes de restauração integral de `public`/`drizzle` e snapshots históricos permanecem documentados em [PHASE8_1_VALIDATION_REPORT.md](PHASE8_1_VALIDATION_REPORT.md); não foram repetidos nesta fase. A falha de uma tentativa visual intermediária ocorreu porque havia só uma data de mercado na fixture. O teste foi corrigido para criar duas datas, repetido e aprovado; não representava falha do Dashboard.

## 11. Problemas restantes

1. O banco do outro computador não está disponível. Os dois SQLs locais antigos têm uma conta diferente da conta inicial no Supabase; qualquer migração requer identificação e plano específico.
2. A topologia real de hospedagem/proxy não foi informada; não há homologação de origem de IP nem teste de carga fora do loopback.
3. O worker não tem paginação/cota de processamento, checkpoint de retomada ou operação observada por longo período. O cron produtivo segue desabilitado.
4. Fontes brasileiras verificadas e vendas comprovadas dependem de contrato, autenticação e checagem de origem externos; CSV particular é autodeclarado.
5. Restam cinco avisos de desenvolvimento da cadeia `braces` sem patch upstream. A cadeia deve ser revista quando houver correção compatível.
6. Checkout, webhooks, ERP/e-commerce e publicação de preços externos não foram homologados nesta fase. Documentos jurídicos e configuração comercial permanecem pendentes antes do cadastro público.

## 12. Critérios objetivos para iniciar a Fase 9

- Decidir se os IDs/conta do dump local devem ser recuperados; se houver banco adicional do outro computador, obter dump autenticado, restaurar em isolamento, comparar e planejar merge sem sobrescrita.
- Definir ambiente de staging e cadeia de proxy; comprovar por teste externo que o backend não aceita acesso direto, que headers são substituídos e que o rate limit funciona com concorrência real.
- Medir tempo/memória do worker com volume representativo, estabelecer limite/paginação e alertas operacionais antes de habilitar cron produtivo.
- Homologar procedência de parceiros BRL e semântica de anúncio versus venda comprovada antes de ativar fontes compartilhadas/verificadas.
- Reavaliar o advisory de desenvolvimento e executar homologações separadas de Mercado Pago, dados jurídicos e integradores comerciais quando a Fase 9 autorizar esses trabalhos.
