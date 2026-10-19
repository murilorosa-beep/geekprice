# GeekPrice Index — plano de expansão

## Etapa 1: concluir a carga controlada

O PostgreSQL local `geekprice_index_dev`, as migrations e o seed de 70 impressões já foram executados. O serviço, os cinco endpoints HTTP com sessão autenticada e o fluxo de busca/preço em Chromium foram verificados nesse banco. Próximo passo: instrumentar latência e retenção das observações. Manter o arquivo original do piloto como evidência datada.

## Etapa 2: qualidade e autorização de dados

Confirmar por escrito condições de armazenamento, atualização, atribuição e redistribuição do MYP Cards e obter acesso aceito para chamadas de servidor: a tentativa anônima do worker recebeu HTTP 403, enquanto a consulta pelo navegador funcionou. A licença MIT do LigaPrice não cobre dados da Liga. Manter Liga Pokémon e Liga Magic desabilitados até haver permissão apropriada. Criar mapeamento explícito entre código MYP, TCGdex e Scryfall; exigir edição e número, depois revisar idioma, acabamento e condição. Preços sem esses campos servem como referência indicativa e não liberam autoaplicação.

## Etapa 3: 300, 1.000 e 3.000 impressões

Expandir por relevância observada, priorizando cartas pesquisadas, estoque de clientes e referências antigas. Inserir cartas sem preço como `unpriced` para medir cobertura real. Separar nomes únicos de impressões: uma busca por nome pode atualizar várias edições. Usar páginas ou lotes pequenos, cursor persistente, filas com lease e trava por fonte para impedir workers simultâneos. Respeitar limites oficiais e reduzir frequência em 429. Comparar hash do conteúdo antes de gravar; atualizar `last_seen_at` quando o preço não muda. Preservar o histórico de mudanças.

## Etapa 4: serviço operacional

Executar worker separado no Railway somente após homologação. Implementar fila com `FOR UPDATE SKIP LOCKED`, tentativas máximas, atraso exponencial, timeout, circuito aberto por fonte e alertas de falha. Agendar lotes pequenos; não consultar provedores nas rotas de leitura. Recalcular agregados por impressão e variante apenas após novas observações. A API deve continuar servindo última referência armazenada com rótulo `stale` quando a fonte falhar.

## Etapa 5: produto e testes

Completar painel administrativo com upload CSV, validação, prévia, revisão de correspondências ambíguas, histórico, exportação de cobertura e execução autorizada de lote. Vincular índice ao estoque apenas com identidade exata e metadados comparáveis. Os testes locais de PostgreSQL, sessão autenticada, deduplicação e E2E Chromium passaram; ampliar para isolamento multiempresa, reinício do worker, rate limit, cache e extração real. Manter o Autopilot em revisão manual enquanto a qualidade não for homologada e nunca equiparar anúncio a venda concluída.

## Capacidade e custo

Monitorar buscas por nome, cartas alteradas, armazenamento por observação, latência de API e taxa de erro. O limite público MYP informado é de 10 requisições/minuto sem token e 60/minuto com token aprovado; 1.000 nomes distintos exigiriam pelo menos 100 ou 17 minutos de cota teórica, respectivamente, antes de latência e margem de segurança. O número de impressões pode ser maior que o de requisições porque cada nome devolve edições múltiplas. Definir orçamento de banco e execução com base em métricas reais do piloto carregado, sem inventar valores de hospedagem.
