# Automação híbrida (#7)

O motor usa regras determinísticas e somente respostas FAQ aprovadas. O classificador `SimulatedIntentClassifier` é uma simulação explícita e não é chamado como integração real. Não há geração livre, cobrança real nem provedor de IA ativo. Perguntas desconhecidas, reclamação, pedido de humano, pausa, opt-out, ausência de consentimento/aprovação e limites impedem respostas automáticas. Custos/tokens determinísticos são zero, registrados na decisão.

`POST /api/automation/run` exige sessão e deriva a empresa do usuário. Recebe somente `conversationId` e `messageId`. O repositório persistente usa `claim_automation` e `commit_automation`, exclusivos do service role, com claim recuperável, lock de tenant e verificação transacional da pausa, consentimento, aprovação e franquia. Credenciais service role nunca são expostas ao cliente. Sem Supabase configurado, a API responde indisponível.

A aprovação é derivada de `onboarding_profiles` (#9): `agent_enabled`, `approved_at` e `approved_revision=revision`. FAQ deve ser fornecida no formato explícito `Q: pergunta` seguido de `A: resposta`; outros textos são transferidos a humano. `automation_settings.config` contém horas/fuso, saudação, teto por hora/tokens e franquia. Perfis owner/admin gerenciam configurações por RLS. A ativação não ignora a pausa individual da conversa.

O resultado é auditado em `automation_decisions`, transferência em `handoffs`, resposta em `automation_outbox`, consumo único por conversa em `usage_events`. A fila não afirma envio real. O dispatcher deve revalidar compliance antes do adapter oficial. Não executa LLM sem contrato aprovado nem despacha mensagens se credenciais/permissões faltarem. Integração operacional após todas migrations (#1–#10); a transação de commit consulta o perfil de onboarding posterior.

Testes locais: 13 cenários com FAQs aprovadas, desconhecidos, reclamações, consentimento, limites, fuso, duplicação concorrente e isolamento do serviço. Validação de integração Supabase é documentada no PR; não há credenciais reais disponíveis neste ambiente.
