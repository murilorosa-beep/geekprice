# Arquitetura e Configuração do Ambiente de Homologação (Staging) — GeekPrice

## 1. Princípios de Segregação

O GeekPrice adota separação estrita em três camadas de ambiente:

| Camada | Propósito | Banco de Dados | Dados Sintéticos Permitidos? | Rate Limit / Proxy |
|---|---|---|---|---|
| **Desenvolvimento Local** | Codificação diária e testes rápidos | PostgreSQL local ou container Docker | Sim | TRUSTED_PROXY_HOPS=0 (loopback) |
| **Staging (Homologação)** | Validação de fluxos comerciais, testes de carga do worker, conciliação e pré-piloto | Base isolada Supabase (`geekprice_staging` ou `geekprice_phase81_test_*`) | Sim (restrito e identificado) | Proxy reverso validado com cabeçalhos sanitizados |
| **Produção (Comercial)** | Operação com lojas reais do piloto assistido | Base principal Supabase (`postgres`) | **Estritamente Proibido** | Proxy confiável obrigatório (WAF/Cloudflare/Caddy) |

> [!IMPORTANT]
> A base de dados principal `postgres` não deve receber sob nenhuma hipótese scripts destrutivos de teste, dados sintéticos de carga ou comandos `DROP`/`TRUNCATE`. O módulo `src/server/environment.ts` bloqueia em runtime qualquer execução de teste contra essa base sem autorização explícita.

## 2. Configuração de Variáveis de Ambiente

### Staging (`.env.staging`)
```bash
APP_ENV=staging
DATABASE_URL=postgresql://postgres.zmdweberkdminhqgyhgp:[SENHA_STAGING]@aws-0-us-east-1.pooler.supabase.com:5432/geekprice_staging?sslmode=verify-full
DATABASE_MIGRATION_URL=postgresql://postgres.zmdweberkdminhqgyhgp:[SENHA_STAGING]@aws-0-us-east-1.pooler.supabase.com:5432/geekprice_staging?sslmode=verify-full
DATABASE_SSL_CA_PATH=certs/supabase-prod-ca-2021.crt
DATABASE_POOL_MAX=3

NEXTAUTH_SECRET=[SEGREDO_ISOLADO_STAGING_32_BYTES]
NEXTAUTH_URL=https://staging.geekprice.com.br

INTEGRATION_ENCRYPTION_KEY=[CHAVE_AES_256_GCM_BASE64_32_BYTES]
CRON_SECRET=[SEGREDO_SEGURO_DO_WORKER_32_BYTES]

# Configuração de Proxy para Staging
TRUSTED_PROXY_HOPS=1
```

## 3. Segurança e Confiança do Proxy Reverso

Em conformidade com a validação da Fase 8.2 e requisitos de segurança:
1. **Loopback Only:** O backend Next.js deve escutar exclusivamente em interfaces internas (`127.0.0.1` ou rede privada virtual).
2. **Substituição de Cabeçalhos:** O proxy reverso (Nginx/Caddy/Traefik) deve sobrescrever ativamente o cabeçalho `X-Forwarded-For` com o IP real da conexão TCP de entrada (`$remote_addr`), prevenindo ataques de falsificação (spoofing) de IP que tentem burlar o rate limiting de autenticação.
3. **TRUSTED_PROXY_HOPS:** Nunca definir `TRUSTED_PROXY_HOPS > 0` até que a topologia de rede e o número de saltos entre o cliente e o servidor de aplicação sejam atestados na infraestrutura final.

## 4. Política de Logs e Zero-Leak

- Todas as senhas, chaves de API externas (Bling, Nuvemshop, WooCommerce), segredos de webhook e tokens JWT são mascarados (`[REDACTED]`) antes de qualquer emissão de log.
- O utilitário `src/server/commerce/credentials.ts` criptografa credenciais em repouso com algoritmo padrão autenticado AES-256-GCM.
- Erros de conexões externas devem logar apenas códigos HTTP e mensagens genéricas, nunca URIs contendo chaves privadas.

## 5. Procedimento de Backup e Recuperação

Antes de qualquer modificação estrutural ou aplicação de migrations em Staging:
```bash
npm run db:backup
```
O script gera um arquivo `.dump` em formato binário customizado (`--format=custom`), valida a assinatura SHA-256, testa o catálogo e simula a decodificação completa antes de autorizar alterações.
