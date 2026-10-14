# GeekPrice — Fase 8.1: validação real no Supabase

Data: 13/10/2026, America/Sao_Paulo. Atualizacao final: 23:39 local (14/10/2026 02:39 UTC).

**Conexão Supabase operacional; fluxos críticos testados com PostgreSQL real e bancos isolados. Conclusão integral da Fase 8.1 ainda pendente dos itens das seções 13–14. Não houve avanço para a Fase 9.**

Este relatório substitui o diagnóstico inicial de banco local indisponível. Resultados não são inferidos de mocks ou de compilação.

## 1. Estado real do ambiente

- Projeto: C:\Users\desk\OneDrive\Desktop\geek-price.
- Node.js 24.13.0; Next.js 16.4.0; Drizzle/postgres-js; PostgreSQL Supabase 17.11.
- Docker/PostgreSQL locais não encontrados. O usuário esclareceu que o banco anterior estava em outro computador e autorizou configurar o Supabase.
- Não foi criado PostgreSQL substituto local. Binários oficiais PostgreSQL 17.11 foram baixados para .tools para pg_dump/pg_restore; Chromium foi instalado nessa pasta para testes de navegador.
- Não há repositório Git reconhecido neste diretório. Exclusões de .env.phase81, .tools, dumps e metadata foram configuradas, mas não é possível confirmar arquivos previamente rastreados sem .git.
- PowerShell bloqueia npm.ps1; usado npm.cmd sem alterar a política de execução.
- Aplicação principal em execução em **http://127.0.0.1:3000**, banco Supabase postgres. Servidor de testes da porta 3108 encerrado após a validação.

## 2. PostgreSQL e conexão

Projeto zmdweberkdminhqgyhgp. URI direta só anunciou IPv6; cliente recebeu ENOTFOUND, tentativa IPv6 explícita retornou ENETUNREACH. Utilizado o **Session pooler fornecido pelo usuário**, aws-0-us-east-1.pooler.supabase.com:5432, banco postgres.

Senha fornecida salva somente no .env, sem reprodução no relatório/saída de diagnóstico. Chave secreta mascarada não foi usada nem inventada. Conexão SQL não depende de @supabase/server: backend continua com Drizzle/postgres-js e autenticação NextAuth.

TLS inicialmente recusou CA desconhecida. CA pública Supabase baixada por HTTPS; cliente valida certificado/hostname. Evidência: **TLSv1.3, authorized=true**. O ssl=false de pg_stat_ssl representa o trecho interno pooler→PostgreSQL, não o TLS cliente→pooler.

Configurações: DATABASE_URL, DATABASE_MIGRATION_URL, DATABASE_SSL_CA_PATH, DATABASE_POOL_MAX (padrão 3), NEXTAUTH_SECRET e NEXTAUTH_URL. Variáveis públicas do projeto registradas no .env sem introduzir outra autenticação. Guia: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## 3. Backup real e restauração

Antes de qualquer alteração no Supabase:

- backups/supabase-2026-10-14T01-17-13-804Z.dump: 290.953 bytes; SHA-256 aeffa7297300af4042c56da53470f0c68998e70c9483a9e0bfdbd0a58f4b5716. Dump atualizado do postgres, não cópia de arquivo antigo; catálogo e decodificação integral verificados. public/drizzle, inicialmente sem tabelas GeekPrice, restaurados no banco isolado.
- Backup renovado imediatamente antes das migrations: supabase-2026-10-14T01-34-19-910Z.dump, 290.953 bytes; SHA-256 e07f77711e1b293bfd2b06d5486d1cf467a81949cc27bace40664e8ddfa65049.

Depois da configuração/migrations/seed:

- **Backup atual:** backups/supabase-2026-10-14T02-33-48-304Z.dump, concluido em 13/10/2026 23:34:33 local.
- **Tamanho:** 397.243 bytes.
- **SHA-256:** d86f7a907b1e4eb6df617140715de9e20835adb4efcfcb926d87d169afe66517.
- Catálogo e decodificação integral aprovados. public/drizzle restaurados em geekprice_phase81_restore_1791945273799: **32 tabelas, 22 registros**, contagens e digests iguais ao principal.
- Backup do banco sintético restaurado em geekprice_phase81_restore_1791941935336: **32 tabelas, 174 registros**, contagens/digests iguais. Evidência: .tools/phase81-restore-results.json.

Escopo: dump lógico --no-owner/--no-acl. Restauração comprovada dos schemas da aplicação; não reproduz proprietários/grants, infraestrutura Supabase ou objetos físicos do Storage. Não foi alegada restauração integral do serviço gerenciado. Arquivos ficam fora dos padrões versionáveis configurados.

Duas falhas de ferramenta corrigidas durante teste: --dbname ausente e schema drizzle não criado antes de restauração filtrada. Nenhuma afetou o principal. Uma tentativa de restauração anterior deixou banco isolado para inspeção; nomes em .tools.

## 4. Migrations realmente aplicadas

Antes: nenhum histórico Drizzle ou tabela public da aplicação. Depois: **13 registros reais em drizzle.__drizzle_migrations**, 0000–0012, todos com timestamp/SHA-256 correspondentes aos SQL locais. **31 tabelas public**, mais a tabela Drizzle.

Cadeia aplicada primeiro em instalação limpa no geekprice_phase81_test_1791940713472; somente após backup e testes aplicada ao principal.

- 0010_perf_indexes: alerts_org_created_idx e price_observations_market_lookup_idx criados.
- 0011_sku_isolation_and_brl_market: índice global único product_variants_sku_uidx ausente; product_variants_sku_idx presente; inventory_org_sku_uidx mantém SKU único por organização; price_observations_currency_region_idx presente.
- 0012_supabase_api_isolation: adicionada nesta execução para impedir bypass de NextAuth/membership pela Data API. RLS nas 31 tabelas e privilégios anon/authenticated revogados. Schema TypeScript também declara RLS.

Journal e os 13 hashes aplicados verificados. Snapshots 0007-0012 reconstruidos reproduzindo SQL em banco exclusivo e introspectando cada checkpoint com Drizzle Kit 0.31.11; cadeia completa 0000-0012 valida. Arquivos brutos em .tools/historical-snapshots. Normalizados somente detalhes equivalentes do deparser (opclasses padrao, casts implicitos e checks equivalentes). db:check e drizzle-kit check passaram; db:generate retornou nenhuma alteracao. Corrigidos no schema alias duplicado, ordem do enum, nomes de FKs truncados/renomeados e indices ausentes/DESC. SQLs e hashes historicos nao foram alterados. Replay adicional com dados sinteticos anteriores a 0007 preservou estoques 3/9, ID canonico, registro historico e backfills de e-mail/onboarding. O banco original do outro computador nao foi importado.

## 5. Multiempresa — PostgreSQL real

Testes recusam destino cujo nome/URI não correspondam ao banco exclusivo no Supabase.

Passaram: duas lojas com mesmo SKU interno e produtos distintos; estoques independentes (3 e 9); metadados/variantes separados; edição cruzada retornando null/HTTP 404; imports em lote independentes; variantes canônicas compartilhadas sem compartilhar referências privadas; SKUs longos sem colisão; três cadastros concorrentes do mesmo SKU retornando um único item.

Correções: SKU longo recebe SHA-256 em vez de truncamento; registro individual/em lote serializado por organização antes das buscas. Estoque, recomendações, mercado e histórico exigem fonte ativa da própria organização, não só inventário pertencente à loja.

## 6. Autenticação e rate limiting

Passaram com banco real: senha correta/incorreta, bloqueio após cinco falhas da mesma origem, cabeçalhos rotativos ignorados sem proxy configurado, dez falhas distribuídas bloqueando conta, expiração simulada alterando apenas timestamps sintéticos, recuperação e limpeza de falhas no sucesso.

Concorrência: 12 tentativas simultâneas, **5 avaliações admitidas e 7 bloqueadas**, contador em 5. Autenticação serializada por conta em transação PostgreSQL; suas consultas usam essa transação para evitar bypass/deadlock.

Login HTTP passou para owner A, owner B e member sintéticos. Chromium passou login sintético e login do administrador real configurado no .env.

TRUSTED_PROXY_HOPS=0 continua ignorando cabecalhos na instalacao principal. Proxy HTTP real validado com backend restrito ao loopback: substitui X-Forwarded-For pelo IP do socket; cabecalhos rotativos nao burlaram cinco falhas; origem persistida igual ao peer TCP; login e recuperacao aprovados. Evidencia .tools/phase81-proxy-results.json. A topologia de um futuro deploy externo exige a mesma restricao de acesso direto. Limitador publico corrigido para upsert atomico e timestamps ISO: 12 pedidos concorrentes admitiram exatamente 3, rejeitaram 9 e nao prorrogaram locks; limite de uma tentativa recuperou apos expiracao real de dois segundos. Login de 15 minutos foi validado alterando timestamps sinteticos, sem aguardar quinze minutos de relogio.

## 7. Importação BRL — real

Passaram upload HTTP de CSV TESTE_SINTETICO, preview, confirmação, inserção PostgreSQL, consulta, repetição sem duplicação; também upload/preview/confirmar pelo navegador.

Rejeições: USD, preço negativo, data antiga, produto inexistente, produto exclusivo de outra loja, idioma/acabamento incorreto. Lote inválido revertido sem criar fonte/observações. Correspondência exige estoque da própria organização e dimensões exatas; ambiguidade rejeitada sem criar catálogo global.

Preview/commit vinculados por HMAC à organização, hash e linhas validadas; expiração 15 minutos. Confirmação adulterada/de outra loja retornou 403. CSV não confere verificação de origem automaticamente. Interface de importação adicionada à página Mercado para admin/owner.

Cotações sintéticas restritas ao banco exclusivo. Fontes novas são privadas/unverified; nome no CSV não dá acesso a fonte compartilhada. Ingestão de parceiros verificados externos não homologada.

## 8. Precificação e recomendações

Custo R$60, taxas 10%, custos adicionais 5%, margem mínima 20%, desejada 25%, referência BRL importada. Piso independente: 60 / (1 - .10 - .05 - .20), **R$92,31** arredondado para cima. Recomendação persistida conferida contra pisos mínimo/desejado e dados do banco.

Corrigido arredondamento: custo R$100, taxas 12%, margem 25% exigem 158,730158...; R$158,73 viola o piso exato. ROUND_CEIL exige **R$158,74**. Unitários/integração confirmaram piso rentável nas recomendações testadas.

## 9. Autopilot

Passaram aprovação supervisionada por serviço/HTTP, atualização sintética, auditoria com preço anterior/novo/mínimo, isolamento de outra loja, rollback restaurando R$110, rejeição de rollback cruzado e segundo rollback.

Lote inacessível agora retorna HTTP 404 em vez de 500. Navegação da interface Autopilot passou; cliques de aprovação/rollback não automatizados. Worker/cron e canal comercial externo não executados.

## 10. Dashboard, HTTP e navegador

**HTTP: 7 fluxos aprovados no build de produção:** login; estoque; papel member/acesso cruzado; assinatura de preview; CSV/deduplicação/consulta; aprovação/rollback; histórico PostgreSQL.

**Chromium: 10 verificações aprovadas:** login; navegação dashboard/produtos/recomendações/alertas/mercado/configurações; cadastro; CSV BRL via UI; dashboard com observações reais. Nenhum pageerror na execução aprovada. Screenshot .tools/phase81-dashboard.png.

**Principal:** login do administrador/dashboard aprovados. Inventário vazio, history.hasData=false, sem curvas fictícias; screenshot .tools/supabase-main-dashboard.png inspecionada. Nenhum produto/cotação sintética no principal.

Removido preço atual da loja usado em datas históricas sem evidência. Sem alterações observadas no dia, storePrice é null; menos de dois dias de observações mantém estado vazio.

Falhas reais: recargas contínuas em dev impediram primeira execução; testes feitos em produção. Depois EMAXCONNSESSION (limite 15): APIs/SSR abriam pools separados. Corrigido singleton também em produção e limite padrão 3. Navegador passou após rebuild/reinício.

## 11. Problemas encontrados

Banco local inacessível; IPv6 indisponível; CA não reconhecida; fontes privadas vazando por variantes compartilhadas; lookup global/incompleto; confirmação desvinculada de preview; UI BRL ausente; colisão de SKU longo; cadastro/login concorrente; arredondamento abaixo do piso; rollback 500; pools excedendo limite Supabase; snapshots faltantes.

## 12. Correções e checks finais

Corrigidos conexão/TLS, isolamento, lookup, preview/UI, SKU/concorrência, piso, rollback e pool. Tabelas protegidas da Data API. GET real anônimo /rest/v1/users?select=id&limit=1 retornou **HTTP 401, PostgreSQL 42501 (permissão negada)**. Nenhuma credencial retornada.

| Categoria | Resultado |
| --- | --- |
| Unitários | 19 arquivos, **67 testes aprovados** |
| Integração PostgreSQL | **20 testes aprovados**, também com pool=3; 100,30 s; .tools/phase81-integration-results.json |
| HTTP | **7 fluxos aprovados**; .tools/phase81-http-results.json |
| Chromium | **10 verificações aprovadas**; .tools/phase81-browser-results.json |
| Principal | login/dashboard; .tools/supabase-main-browser-results.json |
| Backup/restauração | principal 32 tabelas/22 registros; sintético 32 tabelas/174 registros; digests iguais |
| npm.cmd run typecheck | aprovado |
| npm.cmd run lint | aprovado: 0 erros, 2 avisos existentes de navegação |
| npm.cmd test | aprovado |
| npm.cmd run build | aprovado: 65 rotas |

Instalação informou 9 vulnerabilidades (4 moderadas/5 altas); não executado audit fix --force nem avaliada explorabilidade individual. Aviso Vite de formato da configuração. Esses itens não foram tratados como correções concluídas.

## 13. Não verificado

Snapshots 0007–0012/geração futura; upgrade dos dados antigos; proxy confiável real; expiração aguardando quinze minutos; concorrência pública; cliques de aprovação/rollback; worker/cron; origem externa verificada/parceira; integrações/pagamentos/ERP; carga prolongada; restauração de infraestrutura/Storage/grants; revisão das vulnerabilidades de dependências.

Banco do outro computador **não transferido**: não houve acesso/dump fornecido. O Supabase estava sem tabelas GeekPrice e recebeu migrations/cadastro inicial. Nenhum resultado sobre dados antigos inventado.

## 14. Preparação para Fase 9

Conexão/fluxos BRL têm evidência real. Antes de declarar a fase integralmente concluída/avançar: reconciliar snapshots sem duplicar SQL; revisar dependências; homologar proxy/concorrência pública/worker; completar cliques de aprovação; homologar origem de parceiros e integrações separadamente.

Principal sem produtos/cotações; administrador usa SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD já configurados no .env. Servidor permanece em 3000. Bancos isolados mantidos como evidência, incluindo clone de restauração do cadastro real; não devem alimentar a aplicação comercial.

## 15. Revalidação em 14/10/2026

Nova verificação efetuada às 09:23 (America/Sao_Paulo), sem alterar o banco comercial:

- PostgreSQL Supabase acessível via pooler, com TLSv1.3 autorizado; PostgreSQL 17.11.
- As 13 migrations locais, de `0000` a `0012`, constam no histórico real `drizzle.__drizzle_migrations`; os hashes locais e aplicados correspondem.
- Backup lógico novo criado antes da revalidação: `backups/supabase-2026-10-14T12-19-18-527Z.dump`, 397.243 bytes, SHA-256 `6ac66e2d6d1e82736eefb2832ca28b3ad6a3e174857f7c26d0b50c8d2180f5ae`; catálogo e decodificação do arquivo aprovados.
- `npm.cmd test`: 19 arquivos e 67 testes aprovados. `npm.cmd run typecheck` e `npm.cmd run lint`: aprovados. `npm.cmd run build`: compilação de produção aprovada.
- A integração no banco isolado foi iniciada novamente; os quatro primeiros cenários (cadeia/índices de migrations, isolamento de SKU, importação em lote por tenant e SKU longo/concorrência) foram explicitamente aprovados antes de a sessão de execução exceder o tempo de captura. A evidência integral anterior permanece em `.tools/phase81-integration-results.json` (20/20).
- Navegador contra `http://127.0.0.1:3000`: login do administrador e Dashboard aprovados; inventário comercial continua vazio, histórico retorna estado vazio e nenhum preço comercial foi modificado. Evidência atualizada: `.tools/supabase-main-browser-results.json`.

O aviso do Vite sobre futura troca do carregador de configuração continua não bloqueante. Nenhuma funcionalidade pendente foi promovida a validada sem evidência adicional.
