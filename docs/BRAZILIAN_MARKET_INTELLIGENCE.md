# Inteligência de Mercado Brasileiro — Estratégia de Preços e Fontes Verificadas

## 1. Contexto e Desafio no Brasil

O mercado brasileiro de TCG (Magic: The Gathering, Pokémon, Yu-Gi-Oh!, One Piece), mangás e colecionáveis geek possui dinâmicas próprias:
- Dependência do câmbio (USD/BRL) e custos de importação (impostos de importação, frete internacional e margens de distribuição nacional).
- Disparidade entre o preço de anúncio ("asking price" em marketplaces) e o preço efetivo de liquidação ("completed sale").
- Proibição legal e técnica de scraping não autorizado nos termos de uso de portais e plataformas consolidadas.
- Necessidade crítica de os lojistas contarem com referências nacionais em BRL sem comprometerem o sigilo comercial de seus custos.

---

## 2. Avaliação das Alternativas de Dados de Mercado

| Fonte / Estratégia | Tipo de Dado | Modelo de Acesso | Viabilidade Técnica | Viabilidade Jurídica | Nível de Confiança |
|---|---|---|---|---|---|
| **Mercado Livre (API Oficial)** | Anúncios ativos de concorrentes (`listing`) | OAuth 2.0 / API de Busca de Itens (`/sites/MLB/search`) | **Alta** (API REST documentada, SDKs disponíveis) | **Total** (Dentro dos termos para busca pública) | Moderado (anúncios nem sempre refletem venda realizada) |
| **LigaMagic / LigaPokemon** | Cotações de referência de cartas avulsas | Feed Comercial Licenciado / B2B | **Média** (Depende de contrato B2B ou credenciamento de lojista) | **Condicionada a Contrato** (Scraping é proibido pelos ToS) | Alto (referência dominante para TCG no Brasil) |
| **Distribuidores Nacionais (Copag, Devir, Panini, Galápagos)** | Preço sugerido de venda (MSRP) e tabelas atacadistas | Feeds autorizados de revendedor (CSV/XML/portal B2B) | **Alta** (Arquivos estruturados com EAN/ISBN) | **Total** (Autorizado para revendedores credenciados) | Muito Alto para produtos selados e lançamentos |
| **Rede de Lojas Parceiras GeekPrice (Consórcio de Vendas Concluídas)** | Vendas reais faturadas (`completed_sale`) | Integração direta ERP/WooCommerce com opt-in e anonimização | **Alta** (Desenvolvido nativamente no GeekPrice) | **Total** (Consentimento explícito e agregação estatística $k \ge 3$) | **Máximo** (transações financeiras reais) |

> [!CAUTION]
> **Proibição Estrita de Scraping Não Autorizado:**
> O GeekPrice rejeita explicitamente qualquer método de raspagem automatizada que viole termos de serviço de sites terceiros. O produto fundamenta sua autoridade na procedência legal, rastreabilidade e integridade matemática de seus dados.

---

## 3. Estratégia Selecionada para a Fase 9 e Piloto Assistido

A estratégia de inteligência de mercado do GeekPrice estrutura-se em **três pilares complementares**:

```
[Distribuidor Oficial (Copag/Devir)]   -->   MSRP e Custo Atacadista (Piso de Referência)
                                                  │
[Lojas do Piloto Assistido]           -->   Consórcio Anônimo de Vendas Concluídas (k >= 3)
                                                  │
[Mercado Livre (API Oficial)]          -->   Teto de Mercado e Concorrência Ativa
                                                  ▼
                                 [Motor de Precificação GeekPrice]
                                 (Piso Rentável Garantido + Margem Alvo)
```

### Pilar 1: Rede de Lojas Parceiras e Dados Anonimizados de Vendas
- Lojas participantes do piloto assistido podem optar por compartilhar cotações e vendas reais de forma estritamente agregada e anônima.
- **Regra de Privacidade $k \ge 3$:** Nenhuma média pública ou referência compartilhada é emitida para uma carta ou produto se houver menos de 3 lojas distintas com observações recentes (últimos 30 dias). Isso impede que concorrentes infiram o volume ou o preço individual de uma loja específica.

### Pilar 2: Tabela de Preço Sugerido (MSRP) e Lançamentos
- Ingestão autorizada de catálogos e preços de tabela fornecidos por distribuidores oficiais.
- Utilizado como âncora para produtos selados (Displays, Decks, Bundles, Mangás e Livros RPG).

### Pilar 3: Conector de Marketplace via API Oficial
- Utilização da API oficial do Mercado Livre para monitoramento de tendências de preços de cartas e caixas avulsas.
- Observações identificadas estritamente com `priceType: "listing"` e `verified: false` (anúncio público), nunca confundidas com vendas efetivas.

---

## 4. Modelo de Confiança e Proveniência de Cotações

Cada observação no PostgreSQL (`price_observations`) deve carregar a seguinte taxonomia auditável:

| Nível de Verificação | Classificação | Semântica | Influência no Autopilot |
|---|---|---|---|
| **synthetic_test** | Dado sintético | Utilizado em bancos isolados de testes e CI/CD. | **Nunca** aplicado em produção comercial. |
| **merchant_private** | Cotação interna da loja | Importada via CSV da própria loja ou ERP. Isolada por `organization_id`. | Alimenta recomendações **apenas** da própria loja. |
| **partner_verified** | Loja parceira homologada | Loja do piloto com identidade e volume comercial verificados pelo GeekPrice. | Contribui para a média agregada da rede ($k \ge 3$). |
| **distributor_editorial**| Fabricante/Distribuidor | Preço sugerido oficial (MSRP). | Balizador de teto/piso para produtos selados. |
| **marketplace_listing** | API Oficial externa | Preço de anúncio em marketplace. | Indicador de concorrência com alerta de volatilidade. |

---

## 5. Requisitos para Homologação de Novas Fontes

1. **Credenciais Oficiais:** Registro de aplicação com chaves OAuth mantidas exclusivamente no servidor.
2. **Auditabilidade de Origem:** Cada registro persiste URL de procedência, timestamp de captura e identificador externo da oferta.
3. **Validade Temporal:** Cotações com mais de 30 dias são descartadas automaticamente pelo motor de cálculo (`freshSince = now() - 30 days`).
4. **Alvará Administrativo:** Somente administradores da plataforma GeekPrice podem elevar uma fonte ao status `verified: true`. Lojistas não possuem permissão para promover suas próprias fontes privadas a referências globais compartilhadas.
