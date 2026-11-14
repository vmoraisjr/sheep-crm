# CRM e dashboard (#6)

`/demo/crm` e `/demo/dashboard` usam a mesma inbox simulada do navegador; a oportunidade é criada por contato elegível e mantida em `sheep:crm:demo:v1`. Alterar estágio, responsável, próxima ação, valor opcional e tags afeta a visão geral ao navegar. O dashboard conta cada contato uma única vez; conversão é ganhos / oportunidades totais. Pendências vêm da inbox, follow-ups da agenda persistida (zero na demo sem agendamentos reais).

`/crm` e `/dashboard` exigem autenticação e tenant; `/api/crm` filtra dados do tenant e não armazena cache compartilhado. A migration cria oportunidades após a inserção de contatos sem opt-out; chave única de contato/tenant impede duplicatas. O RPC transacional `update_crm_opportunity` aplica RLS e altera tags no contato e detalhes no funil atomicamente. Atribuição real usa o usuário autenticado, nunca um ID arbitrário enviado pelo navegador.

Testes: `npm test -- tests/crm.test.ts`; testes SQL/RLS e navegador na revisão integrada. Nenhum dado financeiro da demo representa cobrança real.
