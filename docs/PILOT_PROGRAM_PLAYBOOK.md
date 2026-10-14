# Guia Operacional do Piloto Comercial Assistido (Pilot Playbook) — GeekPrice

## 1. Visão Geral do Piloto

O piloto assistido do GeekPrice destina-se a validar o produto em condições reais com **3 a 5 lojas físicas/virtuais de TCG, mangás e quadrinhos** no Brasil.

### Diretrizes do Piloto:
- **Gratuidade Total:** Nenhuma cobrança real será efetuada durante o período de piloto (plano cortesia com limite expandido).
- **Operação Supervisionada:** Todas as alterações de preços no Autopilot requerem aprovação manual do lojista (modo `autoApplySafe=false` por padrão).
- **Modo Somente Leitura no E-commerce:** A integração inicial com WooCommerce importa catálogo e estoque, sem publicar alterações automáticas de volta na loja virtual sem confirmação do lojista.
- **Sigilo Comercial:** Custos de aquisição e referências privadas de cada loja são estritamente isolados por `organization_id`.

---

## 2. Jornada do Lojista no Piloto (11 Etapas)

```
[1. Acesso & Credenciais] ────> [2. Criação da Loja] ────> [3. Integração WooCommerce]
                                                                    │
[6. Políticas de Margem]  <──── [5. Conferência Estoque] <──── [4. Importação Catálogo]
        │
        ▼
[7. Referências BRL] ────> [8. Recomendações] ────> [9. Aprovação Autopilot] ────> [10. Histórico & Rollback]
```

1. **Acesso & Boas-Vindas:**
   - O lojista recebe convite individual por e-mail ou credenciais de acesso seguro fornecidas pela equipe GeekPrice.
2. **Onboarding Inicial:**
   - Preenchimento do nome fantasia da loja, moeda (BRL) e categoria principal (Pokémon, Magic, Yu-Gi-Oh!, Mangás).
3. **Conexão com WooCommerce (Opcional mas Recomendado):**
   - O lojista gera chave de API no WordPress (`WooCommerce > Configurações > Avançado > API REST`) com permissão apenas de **Leitura**.
   - Informa URL, Consumer Key e Consumer Secret na tela de Integrações. As chaves são criptografadas com AES-256-GCM.
4. **Importação Inteligente com Conciliação:**
   - O sistema puxa o catálogo do lojista e exibe a prévia com a classificação automática (Exatos, Novos, Prováveis, Conflitos).
   - O lojista confirma os vínculos e importa os itens para o GeekPrice.
5. **Conferência do Estoque:**
   - Na aba Produtos, o lojista confere quantidades, idiomas e acabamentos. Caso algum item não tenha custo no ERP, o lojista insere o custo de aquisição.
6. **Definição de Políticas e Margens:**
   - Configuração de taxas de venda (ex: 10% balcão, 14% marketplace), custos operacionais (ex: 5%) e margem mínima segura (ex: 20%).
7. **Consulta de Referências Nacionais:**
   - O lojista visualiza preços de mercado em BRL na aba Mercado ou faz upload de CSV de cotações privadas.
8. **Geração de Recomendações:**
   - O motor de precificação calcula sugestões otimizadas garantindo que nenhum preço viole o piso rentável (`cost / (1 - taxas - margem)`).
9. **Aprovação Supervisionada pelo Autopilot:**
   - O lojista revisa a fila segura (Safe) e as travas de oscilação (Flagged Spikes). Aprova lotes com um clique.
10. **Auditoria e Rollback:**
    - Cada preço aprovado é registrado com timestamp, usuário e justificativa. O lojista pode desfazer qualquer alteração imediatamente na aba Lotes & Rollback.
11. **Acompanhamento no Dashboard:**
    - Monitoramento da margem média projetada, alertas de estoque e histórico de preços do PostgreSQL.

---

## 3. Matriz de Dependências Comerciais e Legais

| Componente | Situação Atual | Pré-requisito para Produção Comercial | Ação Necessária |
|---|---|---|---|
| **Mercado Pago** | Integrado tecnicamente (checkout e webhooks implementados) | Credenciais de Produção e Homologação de Contrato | Obter `MERCADO_PAGO_ACCESS_TOKEN` de produção após aprovação jurídica dos termos. |
| **Resend (E-mail)** | Integrado (transacionais, recuperação de senha e convites) | Domínio próprio verificado com DKIM/SPF | Configurar DNS corporativo em `resend.com` para o domínio `@geekprice.com.br`. |
| **Termos de Uso (`/terms`)** | Minuta preliminar | Parecer Jurídico Especializado | Revisão formal por advogado especialista em Direito Digital e SaaS B2B. |
| **Política de Privacidade (`/privacy`)** | Minuta preliminar | Adequação LGPD formal | Nomeação de DPO/Encarregado e finalização da política de tratamento de dados. |
| **Suporte ao Lojista** | Canal direto WhatsApp/E-mail com os fundadores | SLA de atendimento formalizado | Definir canal de suporte prioritário para os lojistas do piloto. |

---

## 4. Critérios de Sucesso do Piloto

1. **Economia de Tempo:** Redução de pelo menos 70% no tempo gasto pelos lojistas atualizando preços semanalmente.
2. **Zero Violação de Margem:** Nenhuma recomendação aceita gerou margem líquida inferior à margem mínima estipulada pela loja.
3. **Estabilidade Técnica:** Zero falhas de concorrência ou colisões de SKU entre lojas distintas.
4. **Usabilidade:** Conclusão da jornada de importação e primeira aprovação em menos de 15 minutos sem intervenção técnica.
