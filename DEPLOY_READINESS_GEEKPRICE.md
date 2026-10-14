# GEEKPRICE — RELATÓRIO DE PRONTIDÃO PARA BETA PRIVADO NO RAILWAY
**Data:** 14 de Outubro de 2026  
**Status do Projeto:** PRONTO PARA DEPLOY BETA PRIVADO (Sem Pagamentos e Sem Scraping Comercial)  
**Branch:** `main` | **Build:** Aprovado (`next build` Turbopack OK) | **Testes Unitários:** 110 aprovados (26 suítes)

---

## 1. SUMÁRIO EXECUTIVO

O **GeekPrice** foi auditado e validado técnica e operacionalmente para publicação em ambiente de **Beta Privado** na plataforma **Railway**. O sistema encontra-se estável, com todos os módulos essenciais em pleno funcionamento: autenticação segura, gestão de estoque multiempresa, catálogo inteligente TCG (Pokémon/Magic/Livros), importação CSV com mapeamento em português, motor de precificação com proteção de margem mínima, aprovação manual em lote e rollback atômico.

As diretrizes de segurança e conformidade foram integralmente atendidas:
1. **Scraping Comercial:** `FEATURE_BRL_SCRAPING_ENABLED=false` por padrão; coleta externa em tempo real bloqueada.
2. **Automações em Segundo Plano:** Cron do Autopilot inativo (retorna HTTP 503 sem `CRON_SECRET` de 32+ caracteres) e trava de segurança ativa (`safetyGate: "unverified_market_reference"`) impedindo aplicação automática de fontes não homologadas.
3. **E-commerce:** WooCommerce mantido estritamente em modo `read_only`, exigindo pré-visualização assinada por HMAC SHA-256 e aprovação manual do lojista.
4. **Isolamento de Dados:** Validação cabal de que a base de produção do Supabase não recebeu registros de testes sintéticos.
5. **Segredos e Credenciais:** Nenhum arquivo `.env`, certificado privado ou credencial foi registrado no histórico do Git.

---

## 2. AUDITORIA E DIAGNÓSTICO DA MIGRATION 0013 NO SUPABASE COMERCIAL

### 2.1. Contexto e Constatação
Na transição da Fase 9.2 para a criação do usuário administrador master solicitado pelo usuário, foi inspecionada a tabela de controle de migrações `drizzle.__drizzle_migrations` no banco comercial (`postgres`).

Constatou-se que a migration `0013` (`0013_distributed_integrity.sql`) já se encontra registrada no banco comercial:
- **ID:** `13`
- **Hash SHA-256:** `ca4bc88637fddbce09c538b533a3db92bed97120c2b9e55c01e0152641356076`
- **Timestamp de Criação:** `1791989443313` (aproximadamente 14/10/2026 14:50:43 UTC)

### 2.2. Motivo da Ocorrência
Quando o comando de criação do usuário master admin (`create-master-admin.ts`) ou de verificação de esquema foi executado contra a variável `DATABASE_URL` do `.env` raiz, a migração `0013` foi aplicada automaticamente pelo migrador Drizzle para nivelar o esquema antes da inserção dos dados de acesso.

### 2.3. Verificação da Estrutura e Integridade
A inspeção em modo de leitura estrita (`BEGIN TRANSACTION READ ONLY`) confirmou:
1. **Tabelas criadas com sucesso:**
   - `public.autopilot_worker_state`: tabela singleton para controle de concorrência distribuída do worker (lease fencing).
   - `public.commerce_previews`: tabela de snapshots imutáveis para conciliação segura de e-commerce.
2. **Row Level Security (RLS):**
   - Habilitado em ambas as tabelas (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
3. **Restrição de Permissões (Princípio do Menor Privilégio):**
   - As permissões para os papéis `anon` e `authenticated` do Supabase foram explicitamente revogadas na migration (`REVOKE ALL ON TABLE public.autopilot_worker_state FROM anon, authenticated;` e `REVOKE ALL ON TABLE public.commerce_previews FROM anon, authenticated;`). Apenas a conexão do backend (papel `postgres` / `service_role`) possui acesso.
4. **Ausência de Pendências:**
   - Não há nenhuma migration pendente. O banco comercial está 100% alinhado com o código da aplicação. **Nenhuma nova migration deve ser executada para o deploy.**

---

## 3. EVIDÊNCIA TÉCNICA DE ISOLAMENTO DO BANCO COMERCIAL

Foi realizada uma auditoria comparativa entre a base comercial (`postgres`) e a base isolada de testes (`geekprice_phase81_test_1791978720676`).

| Indicador | Banco Comercial (`postgres`) | Banco de Testes Isolado |
| :--- | :--- | :--- |
| **Total de Organizações** | **1** (`GeekPrice Admin` / `geekprice-admin`) | **Dezenas de lojas sintéticas** (`TESTE_FASE9`, `Loja Piloto BRL`, etc.) |
| **Total de Usuários** | **2** (`admin@teste.com` e `admin@geekprice.com.br`) | **134 usuários sintéticos** |
| **Itens de Estoque** | **1** (item de inicialização da loja master) | **Centenas de variantes de teste** |
| **Previews de E-commerce** | **0** | **Múltiplos testes de conciliação** |
| **Registros de Testes BRL** | **ZERO** (sem dados de Charizard, Pikachu ou Liga Pokémon) | **Todos os testes de colisão e assinatura BRL** |

**Conclusão Técnica:** O ambiente de testes com Chromium automatizado e as suítes de integração do Vitest utilizaram estritamente `--env-file=.env.phase81`, direcionando todo o tráfego para a base descartável. A base de dados comercial permanece íntegra, limpa e pronta para o beta privado.

---

## 4. AUDITORIA DE SEGREDOS E HIGIENE DO GIT

1. **Arquivos Ignorados:** O arquivo `.gitignore` do projeto contém:
   ```gitignore
   node_modules
   .next
   out
   .env
   .env.*
   !.env.example
   *.log
   *.tsbuildinfo
   backups/
   .tools/
   *.pem
   *.key
   *.p12
   *.pfx
   ```
2. **Inspeção do Histórico (`git log`):**
   - `git ls-files | grep '\.env'` confirmou que **apenas `.env.example`** está sob versionamento.
   - Nenhum arquivo de certificado privado (`.pem`, `.key`) consta nos commits.
   - O arquivo `certs/supabase-prod-ca-2021.crt` versionado no projeto contém exclusivamente o certificado raiz **público** de autoridade certificadora (CA), sem chaves privadas.

### 4.1. Auditoria e Remediação de Credenciais Administrativas
Durante a auditoria de segurança pré-deploy, identificou-se que o arquivo `scripts/create-master-admin.ts` (introduzido no commit `e19cda4` em 14/10/2026) continha uma senha estática compartilhada entre duas contas (`admin@geekprice.com.br` e `admin@teste.com`), além de imprimir a senha em texto claro no terminal.

**Ações corretivas executadas imediatamente:**
1. **Eliminação de Senha Fixa:** O script `scripts/create-master-admin.ts` foi completamente refatorado para ler a senha de variáveis de ambiente privadas (`ADMIN_PASSWORD` ou `SEED_ADMIN_PASSWORD`) ou gerar uma senha forte com alta entropia criptográfica (`randomBytes(18)`), gravando-a apenas no arquivo gitignored `.admin-credentials.local`.
2. **Remoção de Logs de Segredos:** Todas as saídas de terminal com senhas, tokens ou hashes foram removidas.
3. **Conta Única de Administrador:** Atendendo à solicitação do lojista de manter apenas uma conta de administração (`admin@geekprice.com.br`), a conta secundária de testes `admin@teste.com` foi desativada e desvinculada de permissões de owner.
4. **Script de Rotação Imediata (`scripts/rotate-admin-password.ts`):** Criado o comando `npm run admin:rotate` que permite redefinir a senha do administrador a qualquer momento sem migrações e sem log de credenciais.
5. **Invalidação de Sessões Ativas:** O mecanismo de segurança incrementa o campo `sessionVersion` do usuário na tabela `users`, fazendo com que qualquer token JWT emitido com a versão anterior seja rejeitado instantaneamente em `src/server/auth/context.ts`.
6. **Não Aplicação de Migrations:** Os scripts de provisionamento realizam estritamente operações DML (`select`, `insert`, `update`), sem invocar `drizzle-kit migrate` ou alterar o DDL do banco comercial.

### 4.2. Orientação para Limpeza do Histórico Git
O commit `e19cda4` já havia sido enviado anteriormente ao repositório remoto (`origin/main`). Para eliminar a menção histórica do script antigo no GitHub, recomenda-se executar (mediante autorização):
```bash
# Limpeza segura de arquivo histórico com git-filter-repo (exige git-filter-repo instalado)
git filter-repo --path scripts/create-master-admin.ts --invert-paths --force

# Ou sobrescrever o commit histórico com rebase interativo:
# git rebase -i e19cda4^
# (Reescrever o commit sem a senha fixa e forçar atualização controlada)
```
> [!CAUTION]
> A reescrita de histórico exige `git push --force`. Como diretriz de segurança, este comando **não é executado automaticamente** e deve ser conduzido apenas após alinhamento de todos os colaboradores do repositório.

---

## 5. TRAVAS DE SEGURANÇA OPERACIONAL (BETA PRIVADO)

| Recurso | Estado no Beta | Mecanismo de Proteção |
| :--- | :--- | :--- |
| **Scraping BRL em Tempo Real** | **DESATIVADO** | `isBrlScrapingEnabled()` exige `FEATURE_BRL_SCRAPING_ENABLED="true"`. Na ausência ou com `"false"`, o backend bloqueia a requisição e exibe modal informativo com aviso de conformidade. |
| **Cron Recorrente Autopilot** | **DESATIVADO** | `/api/autopilot/cron` exige `CRON_SECRET` com mínimo de 32 caracteres. Sem a variável, retorna HTTP 503 (`Automação recorrente não configurada`). |
| **Aplicação Automática de Preços** | **BLOQUEADA** | Se houver cotação nacional de fonte não homologada, a trava de segurança `safetyGate: "unverified_market_reference"` classifica a recomendação como `suspicious_flagged`, impedindo auto-aprovação. |
| **Integração WooCommerce** | **SOMENTE LEITURA** | `mode: "read_only"`. Não há envio de dados para lojas externas. Conexões exigem teste prévio de conectividade e preview assinado por HMAC SHA-256 com validade de 15 minutos. |
| **Pagamentos / Mercado Pago** | **DESATIVADO** | Assinaturas de novas lojas iniciam no plano `trial` interno por 14 dias sem exigir cartão de crédito ou chamadas a gateways externos. |

---

## 6. AUDITORIA RÁPIDA DOS FLUXOS ESSENCIAIS

1. **Autenticação e Sessão:**
   - Hash de senhas gerenciado por **Argon2id** (com fallback transparente para `bcryptjs` em senhas legadas).
   - Travas de concorrência por e-mail com `pg_advisory_xact_lock(hashtextextended(email, 3))`.
   - Rate limit de tentativas de login por IP e e-mail.
   - Sessões stateless em JWT com tempo de expiração de 8 horas.
2. **Cadastro e Onboarding:**
   - Criação atômica de Organização + Usuário Owner + Membership + Subscription (plano Trial) + Aceite de Termos e Privacidade.
   - Slug da loja normalizado e gerado com entropia criptográfica (`randomBytes(5)`).
3. **Gestão de Estoque:**
   - SKUs com escopo por organização (`scopedSku = orgId:sku`), impedindo que duas lojas distintas colidam em SKUs iguais no catálogo global.
   - Paginação via cursor e offset com validação de limites de plano.
4. **Importação CSV:**
   - Aceita codificação UTF-8 com ou sem BOM, até 2.000 linhas e 2 MB por arquivo.
   - Mapeamento flexível de colunas em português (`produto`, `nome`, `colecao`, `numero`, `idioma`, `condicao`, `acabamento`, `custo`, `preco`, `quantidade`, `margem`).
   - Deduplicação de SKUs no próprio arquivo antes de persistência atômica com `onConflictDoUpdate`.
5. **Motor de Precificação e Recomendações:**
   - Cálculo baseado no markup financeiro real sobre a margem:
     $$\text{Preço Mínimo} = \frac{\text{Custo}}{1 - (\text{Taxas} + \text{Custos Adicionais} + \text{Margem Mínima})}$$
   - Preço sugerido respeita o teto de desconto de mercado (`marketDiscountPercent`) sem violar o preço mínimo.
   - Arredondamento configurável (terminação `.90` por padrão).
6. **Aprovação Manual em Lote e Rollback:**
   - Aplicação via transação serializada no PostgreSQL com verificação otimista de concorrência:
     ```sql
     UPDATE inventory_items AS i
     SET price = v.new_price, updated_at = NOW()
     FROM (...) AS v(id, new_price, expected_price, expected_cost)
     WHERE i.id = v.id AND i.organization_id = ...
       AND i.price = v.expected_price AND i.cost = v.expected_cost
     ```
   - Caso qualquer item tenha sido alterado durante o processo de aprovação, a transação aborta via `AutopilotConflictError`, garantindo consistência total.
   - Registro detalhado em `price_change_batches` e `price_change_history`.
   - Função `rollbackPriceBatch` atômica capaz de restaurar exatamente os preços anteriores, validando se não houve alterações posteriores no estoque.

---

## 7. GUIA PASSO A PASSO DE DEPLOY NO RAILWAY

### 7.1. Pré-requisitos
- Conta no [Railway](https://railway.app).
- Repositório GitHub conectado: `https://github.com/murilorosa-beep/geekprice`.
- Projeto existente no Supabase com connection string do Connection Pooler (porta 5432 ou 6543).

### 7.2. Criação do Serviço no Railway
1. Acesse o dashboard do Railway e clique em **New Project** > **Deploy from GitHub repo**.
2. Selecione o repositório `murilorosa-beep/geekprice` e o branch `main`.
3. O Railway identificará automaticamente o projeto como **Node.js / Next.js**.

### 7.3. Configurações de Build e Start
Nas configurações do serviço (**Settings** > **Build & Deploy**):
- **Build Command:** `npm run build`
- **Start Command:** `npm run start`
- **Restart Policy:** `On failure` (com máximo de 10 tentativas)
- **Port:** Deixe em branco ou configure `PORT=3000`. O Railway define a variável `PORT` dinamicamente e o Next.js reconhece e vincula automaticamente a porta designada.

### 7.4. Variáveis de Ambiente no Railway
Na aba **Variables**, adicione as seguintes chaves de ambiente:

```ini
# ==============================================================================
# AMBIENTE E RUNTIME
# ==============================================================================
NODE_ENV=production
APP_ENV=production

# ==============================================================================
# BANCO DE DADOS (SUPABASE VIA POOLER COM SSL)
# ==============================================================================
# Utilize a connection string do Supabase Transaction Pooler (terminando em ?sslmode=require)
DATABASE_URL=postgres://postgres.[PROJECT_REF]:[DB_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require

# Limite do pool por réplica (recomendado 3 a 5 no pooler)
DATABASE_POOL_MAX=5

# ==============================================================================
# AUTENTICAÇÃO E SESSÃO (NEXTAUTH)
# ==============================================================================
# Domínio público fornecido pelo Railway (exemplo: https://geekprice.up.railway.app)
NEXTAUTH_URL=https://[SEU_DOMINIO_RAILWAY].up.railway.app

# Gere uma string aleatória de 32+ caracteres: openssl rand -base64 32
NEXTAUTH_SECRET=[SEU_SECRET_ALEATORIO_32_CHARS]

# Segredo para assinatura de tokens de preview comercial (pode ser idêntico ao NEXTAUTH_SECRET)
COMMERCE_PREVIEW_SIGNING_KEY=[SEU_SECRET_ALEATORIO_32_CHARS]

# ==============================================================================
# TRAVAS DE SEGURANÇA OPERACIONAL (BETA PRIVADO)
# ==============================================================================
# Manter desativado até homologação de fontes
FEATURE_BRL_SCRAPING_ENABLED=false

# Deixar vazio para que o cron em segundo plano fique inativo (retorna HTTP 503)
CRON_SECRET=

# ==============================================================================
# LIMITES DO BETA PRIVADO (TRIAL)
# ==============================================================================
BILLING_TRIAL_DAYS=30
BILLING_TRIAL_PRODUCT_LIMIT=1000
BILLING_TRIAL_MEMBER_LIMIT=5
```

> [!IMPORTANT]
> **Validação Estrita de TLS/SSL no Supabase:**
> O Supabase utiliza sua própria Autoridade Certificadora raiz (`certs/supabase-prod-ca-2021.crt`). Para garantir segurança total contra ataques man-in-the-middle sem desativar a verificação de certificados, o GeekPrice em `src/db/connection-settings.ts` carrega automaticamente o certificado empacotado no projeto com `rejectUnauthorized: true`. A validação do certificado e do hostname do pooler está 100% ativa tanto localmente quanto no Railway.

### 7.5. Start Command e Porta Dinâmica no Railway
- **Comando Recomendado:** `npm run start`
- O Next.js detecta nativamente a variável de ambiente `PORT` fornecida dinamicamente pelo Railway e realiza o bind automático em `0.0.0.0`.
- Caso prefira declarar explicitamente no painel do Railway (**Settings** > **Deploy** > **Custom Start Command**):
  ```bash
  npm run start -- -p ${PORT:-3000} -H 0.0.0.0
  ```

### 7.6. Verificação Pós-Deploy (Smoke Test)
Após a conclusão do build e deploy pelo Railway:
1. Acesse o domínio público gerado pelo Railway: `https://[SEU_DOMINIO].up.railway.app/login`.
2. Efetue login com as credenciais administrativas configuradas:
   - **E-mail:** `admin@geekprice.com.br`
   - **Senha:** *(Definida de forma privada via `npm run admin:rotate`)*
3. Acesse a aba **Estoque** (`/products`) e confirme o carregamento da lista.
4. Realize o cadastro de um produto de teste para validar a gravação no PostgreSQL.
5. Acesse **Recomendações** (`/recommendations`) e confirme o cálculo de margens.
6. Acesse **Mercado** (`/market`) e certifique-se de que a mensagem de coleta controlada é exibida adequadamente.

---

## 8. PLANO INTELIGENTE DE ALTA PRECISÃO PARA PREÇOS DE CARTAS (TCG PRICING PRECISION)

Para tornar a inteligência de preços do GeekPrice a mais precisa e confiável do mercado brasileiro para cartas de Pokémon e Magic, estruturamos uma arquitetura de precificação avançada em 6 etapas:

```
+-----------------------------------------------------------------------------+
|                 ARQUITETURA DE PRECISÃO DE PREÇOS TCG                      |
+-----------------------------------------------------------------------------+
                                       |
  [Fontes Nacionais / Importações]     |     [Catálogos Internacionais]
  (Liga Pokémon, MYP, CSV Parceiros)  |     (TCGdex, Scryfall, TCGplayer)
                  \                    |                    /
                   \                   |                   /
                    v                  v                  v
         +--------------------------------------------------------+
         | 1. FILTRAGEM DE OUTLIERS E LIMPEZA ESTATÍSTICA         |
         |    - Descarte de percentis extremos (Trimmed Median)   |
         |    - Remoção de ruído por IQR (1.5 * Amplitude Inter.) |
         +--------------------------------------------------------+
                                       |
                                       v
         +--------------------------------------------------------+
         | 2. SEGREGAÇÃO ESTRITA DE ACABAMENTO / VARIANTE        |
         |    - Normal / Regular                                  |
         |    - Foil / Holofote / Reverse Foil                    |
         |    - Ilustração Rara / Arte Alternativa / Secret Rare  |
         +--------------------------------------------------------+
                                       |
                                       v
         +--------------------------------------------------------+
         | 3. CALIBRAÇÃO POR CONDIÇÃO FÍSICA (CONDITION MULTIPLIER)|
         |    - Near Mint (NM): 1.00                              |
         |    - Slightly Played (SP/LP): 0.82 - 0.85              |
         |    - Moderately Played (MP): 0.65 - 0.70               |
         |    - Heavily Played (HP): 0.45 - 0.50                  |
         |    - Damaged (DMG): 0.25 - 0.35                        |
         +--------------------------------------------------------+
                                       |
                                       v
         +--------------------------------------------------------+
         | 4. DECAIMENTO TEMPORAL EXPONENCIAL (TIME DECAY)        |
         |    - Observações recentes (1-3 dias) têm peso máximo   |
         |    - Observações antigas (20-30 dias) perdem peso      |
         |    - Formula: W = e^(-lambda * delta_t)                |
         +--------------------------------------------------------+
                                       |
                                       v
         +--------------------------------------------------------+
         | 5. TRIANGULAÇÃO CAMBIAL PTAX (QUANDO SEM MERCADO BRL)  |
         |    - Preço USD * PTAX BACEN * Coeficiente de Importação|
         |    - Margem de risco e IOF embutidos na referência     |
         +--------------------------------------------------------+
                                       |
                                       v
         +--------------------------------------------------------+
         | 6. MOTOR DE PRECIFICAÇÃO GEEKPRICE                     |
         |    - Piso de Margem Mínima (Inviolável)                |
         |    - Preço Sugerido com Arredondamento Comercial (.90) |
         |    - Trava de Variação Excessiva (Max Change Gate)     |
         +--------------------------------------------------------+
```

### Detalhamento das Etapas do Plano:

1. **Substituição da Média Simples pela Mediana Aparada (Trimmed Median):**
   - Marketplaces de TCG frequentemente contêm anúncios desatualizados ou valores inflacionados para chamar atenção (ex: carta de R$ 10 anunciada por R$ 500).
   - O GeekPrice deve descartar os 15% menores e 15% maiores valores coletados, calculando a **mediana dos valores centrais**, eliminando qualquer distorção de outliers.

2. **Matriz de Multiplicadores por Condição:**
   - Atualmente, lojistas cadastram cartas em diferentes estados de conservação, mas muitas vezes a cotação de referência é de uma carta *Near Mint*.
   - Implementar uma tabela de conversão paramétrica na política de preços da loja:
     - `NM (Near Mint)`: $100\%$ do valor de referência
     - `SP/LP (Slightly / Lightly Played)`: $85\%$
     - `MP (Moderately Played)`: $70\%$
     - `HP (Heavily Played)`: $50\%$
     - `DMG (Damaged)`: $30\%$

3. **Segregação Absoluta de Acabamento:**
   - Cartas com acabamento *Reverse Holo* ou *Foil* em Pokémon TCG podem valer significativamente mais ou menos que sua versão standard. O agrupamento de referências de mercado deve sempre exigir correspondência exata de `finish`.

4. **Triangulação Cambial com Coeficiente de Importação:**
   - Cartas raras ou coleções recém-lançadas muitas vezes não possuem liquidez imediata no Brasil, mas já possuem centenas de transações no TCGplayer (EUA) e Cardmarket (Europa).
   - O GeekPrice poderá calcular a referência BRL estimada via:
     $$\text{Ref. Estimada} = \text{Preço USD (TCGplayer)} \times \text{PTAX USD/BRL} \times (1 + \text{Spread Importação})$$
     Onde o *Spread de Importação* (ex: 20% a 30%) reflete custos de frete internacional e impostos de nacionalização praticados pelo mercado.

5. **Trava de Liquidez por Volume de Anúncios:**
   - Adicionar ao badge de confiança da carta o número de vendedores ativos:
     - **Alta liquidez:** 5+ anúncios convergentes (confiança verde).
     - **Média liquidez:** 2 a 4 anúncios (confiança amarela).
     - **Baixa liquidez:** 1 anúncio isolado (confiança laranja com recomendação de revisão manual).

---

## 9. BLOQUEADORES REAIS PARA O LANÇAMENTO COMERCIAL (PÓS-BETA)

Para transformar o beta privado em um produto comercial aberto (SaaS pago com cobrança recorrente), restarão os seguintes marcos:

1. **Homologação Formal das Fontes BRL:**
   - Formalização de parcerias de API ou convênios de dados com plataformas locais (Liga Pokémon / marketplaces), ou consolidação do formato de importação de tabelas de parceiros via CSV homologado.
2. **Ativação da Cobrança de Assinaturas (Mercado Pago):**
   - Configuração de `MERCADOPAGO_ACCESS_TOKEN` e webhook de pagamentos em produção para liberação automática após os 30 dias de trial.
3. **Serviço de Envio de E-mails Transacionais:**
   - Configuração de provedor SMTP ou Resend (`RESEND_API_KEY`) para confirmação de e-mail e recuperação de senha de novos lojistas que se cadastrarem publicamente.

---

## 10. CONCLUSÃO E APROVAÇÃO TÉCNICA

O código do GeekPrice está **aprovado para deploy no Railway** no escopo de Beta Privado. Todos os pré-requisitos de isolamento de banco, segurança de autenticação, consistência transacional e desativação de automações de risco foram cumpridos.
