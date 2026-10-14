# GeekPrice — Fase 9.1: validação WooCommerce

Data: 14/10/2026. Escopo: revisão local do commit `294669f` na branch `phase-9-pilot-readiness`. **Resultado: piloto WooCommerce ainda não homologado.** As correções abaixo são parciais; os bloqueios P0/P1 permanecem.

## 1. Evidência e ambiente

Git inicial limpo. Nenhuma credencial de loja ou ambiente WooCommerce de staging foi fornecido. Não houve acesso a loja real, alteração de banco principal, migração, deploy ou cobrança.

## 2. SSRF — implementado e testado localmente

`safe-request.ts` exige domínio HTTPS público sem usuário, senha, caminho ou porta alternativa; resolve IPv4, rejeita faixas não públicas, fixa o endereço resolvido na conexão TLS, não segue redirects e limita resposta a 5 MB e tempo a 10/20 s. O conector passou a usá-lo nos GETs. O bloqueio de IPv6 é conservador: lojas somente IPv6 não são suportadas. Necessário teste de egress na infraestrutura final e revisão contínua das faixas especiais.

## 3. Checkpoint do Autopilot — P0 aberto

`worker.ts` ainda grava `.tools/autopilot-worker-checkpoint.json`. O advisory lock impede simultaneidade enquanto a sessão está viva, mas o checkpoint não é durável entre instâncias. O offset não inclui canal; retomada pode repetir/pular trabalho. Limites por ciclo podem deixar organizações posteriores sem justiça. Recomenda-se tabela de lease/checkpoint por execução, cursor estável por item/canal, transação para progresso, idempotência de lote e teste de crash/restart. **Não aplicar migração à base principal sem backup e autorização explícita.**

## 4. Conector WooCommerce — parcial

Somente métodos GET no conector. Os testes sintéticos cobrem produto simples, atributos TCG, custo ausente e HTTP 429. Não foram homologadas variações, SKUs duplicados, estados draft/private, 401/403, paginação de catálogo real ou políticas de retry. O fallback de conexão continua consultando produtos caso `system_status` falhe.

## 5. Credenciais — parcial

`credentials.ts` usa AES-256-GCM com IV aleatório e exige chave separada `INTEGRATION_ENCRYPTION_KEY`; a ausência falha fechada. Não há procedimento implementado de rotação com versão de chave, revogação remota no WooCommerce ou auditoria específica de acesso/deleção.

## 6. Preview/commit — P0 aberto

Foi removido o fallback que recriava preview diferente quando o cache local desaparecia; agora exige o snapshot original. Hash e contagem são conferidos antes do commit. Preço e custo de itens locais existentes não são mais sobrescritos. Ainda faltam snapshot durável, consumo único de token, revalidação transacional das correspondências, validação estrita da confirmação provável, detecção de mudanças na origem e defesa contra replay em instâncias distintas. Não considerar o fluxo pronto para importação real.

## 7. Idempotência e falha parcial — aberto

Há mapeamento externo e lock por organização, mas exceções por item dentro da transação podem deixar estado ambíguo; não foi executado ensaio de concorrência real. Registro de sync run ocorre fora da transação principal.

## 8. Autopilot e preços — aberto

Não foi comprovada idempotência financeira após crash entre aplicação e checkpoint. Autoaplicação no canal `counter` permanece habilitada conforme regras existentes; não foi disparada nesta fase.

## 9. Isolamento de staging

`docs/STAGING_ENVIRONMENT.md` define banco e segredos separados. Não foi comprovado um deployment com egress, backup, logs, jobs e webhooks isolados. O banco principal não recebeu escrita.

## 10. UX `/integrations` — não homologada

A rota existe e compila. Não houve sessão autenticada de staging para percorrer credenciais, conflitos, confirmação, histórico e desconexão no navegador.

## 11. Benchmarks — não executados

Sem base PostgreSQL isolada confirmada nesta execução. Não há números p50/p95 para 100, 1.000, 5.000 ou 10.000 itens; nenhuma extrapolação foi feita.

## 12. Testes automatizados

`npm run typecheck`: aprovado. `npm test`: 24 arquivos, 82 testes aprovados fora do sandbox (o primeiro ensaio no sandbox falhou por ENOENT em temporários do runner). `npm run lint`: 0 erros, 2 warnings preexistentes em login/onboarding. `npm run build`: aprovado fora do sandbox (o primeiro ensaio falhou por acesso negado do Turbopack ao canonicalizar o projeto).

## 13. PostgreSQL de integração

Os 27 testes reportados na Fase 9 são evidência histórica, não repetidos nesta execução. Nenhuma migration foi aplicada. Antes de repetir, confirmar que `DATABASE_URL` aponta exclusivamente para base de teste isolada.

## 14. Segurança operacional

Manter chave WooCommerce somente-leitura, egress restrito a 443 público, DNS confiável, logs sem segredos e revisão do proxy. Não habilitar push de preços, pagamentos públicos ou jobs de piloto neste estado.

## 15. Critério de avanço

Bloqueado até: checkpoint durável/idempotente; preview persistente com replay e concorrência controlados; teste de loja WooCommerce staging consentida cobrindo variações e erros; PostgreSQL isolado com testes de crash e benchmark; validação de UX e isolamento de staging. A Fase 9.1 não autoriza piloto comercial.
