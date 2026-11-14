# Evidências da entrega #1–#10

Verificação local realizada em 14/11/2026. Issue #11 excluída do trabalho. Cada issue tem branch e PR próprios; PRs empilhados devem ser integrados na ordem das bases, começando pelo #12. Nenhum merge foi realizado automaticamente.

## Resultados integrados

- `npm run lint`: aprovado, sem erros.
- `npm run typecheck`: aprovado.
- `npm test`: 64 testes em 10 arquivos aprovados.
- `npm run build`: produção Next.js/Webpack aprovada.
- `npm run test:database`: dez migrations aplicadas a PostgreSQL 17 novo e nove suites SQL aprovadas, com rollback dos fixtures. O bootstrap reproduz Auth mínima; não é teste de Supabase hospedado.
- `npm run test:e2e`: Chromium, inbox/CRM/dashboard e onboarding em 390px e 1440px aprovados, sem pageerrors ou overflow horizontal. Os testes de navegador usam somente o modo simulado explicitamente identificado.

As suites SQL cobrem criação de organização e RLS; vínculo composto por tenant; duplicação inbound; proibição de forjar/modificar mensagens Meta; rotas e leases das filas; nonce OAuth; saída com resultado incerto; criação automática de oportunidade; aprovação/revogação de conhecimento; uso isolado em três empresas; reserva mensal, cap hard, cap soft e conversa já medida; fencing de follow-up e impedimento de automação sem aprovação.

Os testes de API/adaptadores usam transportes falsos com fixtures, validam assinaturas e guardrails e não foram declarados integrações Meta reais. Uma mensagem `origin=meta` criada pelo worker de teste SQL é fixture confiável do teste, não evidência de conta conectada.

## Bloqueios externos

Não foram fornecidos projeto Supabase, e-mail autenticado, app/tokens Meta, conta WABA, Instagram profissional/tester, permissões/App Review nem endpoint webhook público. Portanto login hospedado/entrega de e-mail, WhatsApp sandbox real, Instagram tester real e três pilotos comerciais reais não foram homologados. Os critérios externos das issues #3/#4/#10 continuam pendentes e têm roteiro operacional; código e simulações não substituem essas evidências.

Não há modelo IA externo configurado. Há regras e FAQ exata com contexto aprovado e fallback humano; a porta de classificador simulado é identificada como tal. Sem cobrança real. Reservas de franquia não significam entrega de mensagens.

## Repetição

Siga comandos do README e variáveis de `.env.example`. `npm run test:database` cria e remove seu próprio container sem publicar portas; nunca aplica bootstrap em um banco existente. A CI repete os testes usando PostgreSQL descartável e Chromium instalado pelo Playwright. O build usa Webpack para funcionar também em worktrees com dependências reutilizadas por symlink.
