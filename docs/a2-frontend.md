# A2 CRM — frontend e validação

Implementação sobre o Next.js 16, React 19, TypeScript e Supabase existentes. Não foi criado um backend paralelo nem substituída a autenticação multiempresa.

## Executar

```powershell
cd D:\sheep-crm\sheep-crm
npm ci
npm run dev
```

Abra `http://localhost:3000/login`. Sem variáveis Supabase, use **Explorar demonstração** ou `/demo/dashboard`, `/demo/crm` e `/demo`. A demonstração não autentica usuários, não envia mensagens e não acessa serviços Meta/IA. Negócios e tarefas são gravados exclusivamente no localStorage do navegador; conversas preservam a chave de armazenamento anterior para compatibilidade.

Para integrar, copie `.env.example` para `.env.local`, configure o Supabase e aplique todas as migrations, incluindo `0011_a2_pipeline.sql`. Nenhuma migration foi aplicada a um banco de produção. Não coloque chaves privadas em `NEXT_PUBLIC_*`.

Configure URLs permitidas do Supabase para `/auth/callback?next=/primeiro-acesso`. Convites e recuperação também podem usar o template `/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (ou `recovery`). Ativação exige sessão validada pelo Supabase; o e-mail do convite é somente leitura. A senha mínima permanece em 12 caracteres, preservando a política anterior, acrescida de maiúscula e número na ativação. O checkbox Manter conectado controla a duração dos cookies, inclusive na renovação pelo proxy.

## Telas e componentes

- `/login`, `/recuperar-senha`, `/primeiro-acesso`: cards compactos, logotipo oficial, validações, carregamento, mostrar/ocultar senha e erros. Recuperação usa confirmação neutra, sem revelar a existência da conta.
- `/dashboard`: métricas calculadas, distribuição do pipeline e atividades. A versão mobile reorganiza os cards, atividades e navegação inferior.
- `/negocios`, `/negocios/:id`: cinco etapas iniciais, busca, filtros, detalhes e histórico. `/crm` continua disponível.
- `/conversas`: canais, busca por nome/conteúdo, filtros por responsável e atendimento, mensagens, assumir/pausar/retomar/encerrar, contato, follow-ups e criação/abertura de oportunidade. `/inbox` continua disponível.
- Componentes compartilhados: `Logo`, `Navigation`, `Drawer` (dialog modal com foco e Escape), `PasswordInput`, `KanbanBoard`, `DealCard`, `DealDetailsDrawer`, `DashboardOverview`, `Followups`, `StageRules`, formulários de oportunidade e autenticação.

## Operações reais do Kanban

`@dnd-kit` usa sensores separados para mouse e toque, além de coordenadas de teclado entre colunas. A alça separa arraste e abertura dos detalhes. O card em movimento, o espaço de origem e a coluna de destino têm estados visuais próprios. O quadro tem rolagem horizontal.

O modelo tipado contém pipeline, etapa, posição, contato/empresa, valor, responsável, canal, prioridade, status, datas e histórico. As etapas estão centralizadas em dados com IDs estáveis; `lost` é suportado nos detalhes e no banco, sem uma sexta coluna inicial. O pipeline padrão é o único configurado nesta entrega; edição visual de pipelines personalizados não foi implementada.

A demonstração persiste no navegador. No modo integrado, `PATCH /api/crm` chama uma RPC transacional para ordenar a coluna e atualizar a etapa. O banco serializa movimentações por empresa e produz o histórico com autor e horário próprios. Um trigger impede que o cliente substitua o histórico. A interface atualiza otimisticamente e restaura o snapshot se a gravação falhar. Falhar apenas a leitura posterior a uma gravação confirmada não desfaz a operação concluída.

A regra existente de **uma oportunidade por contato elegível** foi preservada. O formulário integrado permite selecionar um contato existente e atualizar título/valor da oportunidade correspondente. A entrada de novos contatos continua vinculada aos canais existentes. Empresa é um campo textual; cadastro e relacionamento com um catálogo separado de empresas ainda não existem no backend original.

## Contratos existentes e novos

| Serviço | Contrato |
| --- | --- |
| Sessão e convite | Supabase Auth; sessão validada no servidor por `requireTenant()` |
| CRM | `GET/PATCH/POST /api/crm`; o tenant é obtido da sessão, nunca do corpo |
| Conversas/mensagens | `GET /api/inbox`, `PATCH /api/inbox/:id`, `POST /api/inbox/:id/reply` existentes |
| Tarefas internas | `GET/POST /api/tasks`: ID, contato, prazo, responsável, observações e conclusão |
| Transições automáticas | `GET/POST /api/stage-rules`: etapas, habilitação, observação e prazo; gravação exige owner/admin |
| Meta e workers | Adaptadores, webhooks, outbox, consentimento e controle de uso existentes preservados |

As regras de mudança de etapa começam desabilitadas. Quando habilitadas, criam **somente tarefas internas**, na transação do banco, com identificador de transição único contra duplicação. Não disparam WhatsApp, Instagram nem e-mails. A interface oferece regras consecutivas com prazo de 24 horas; o contrato aceita prazo e observação personalizados. Na demonstração há apenas prévia da configuração dessas regras.

Os novos follow-ups são tarefas de CRM. Não são os jobs de envio de mensagens de `/api/followups`; a distinção evita disparos externos acidentais. Atribuição da tarefa é texto descritivo; o backend original ainda não fornece um catálogo de usuários com nomes para seleção. O isolamento das tarefas é feito por RLS e chave de contato composta por empresa.

O campo `author_kind` diferencia mensagens humanas, de automação e de clientes. Origem `meta`/`simulated` indica transporte e não identifica o autor. Mensagens antigas sem autoria comprovada permanecem explicitamente desconhecidas. Encerrar pausa a automação e bloqueia resposta manual até reabrir/assumir.

## Figma e diferenças registradas

Foram consultados o arquivo `sntw6O2Ieywj6yUj4ifgfU`, a página `identidade visual` (`11:5`), o logotipo (`11:18`), os frames `14:2`, `14:36`, `14:67`, `4:2`, `4:82`, `10:2` e `10:159`. Todos estavam acessíveis. O bitmap oficial está em `public/brand/identity.png`, com o mesmo recorte do Figma; não há URLs temporárias de assets no código. Inter é servida localmente via `@fontsource/inter`.

As capturas `docs/a2--*.png` registram as seis telas em 390, 768 e 1440 pixels. Foram inspecionadas visualmente e corrigidos pesos, espaçamentos e adaptações mobile. Não se declara equivalência pixel a pixel: os avisos de demonstração/configuração, controles funcionais adicionais, ícones Lucide, dados calculados, política de senha de 12 caracteres e navegação reduzida às funcionalidades existentes diferem do layout estático. As telas sem frame mobile específico receberam adaptação própria. Dados e crescimento percentual do Figma não foram fixados artificialmente no dashboard.

## Verificação

```powershell
npm test
npm run typecheck
npm run lint
npm run test:database
npm run build
npx playwright install chromium
npm run test:e2e
```

`test:database` requer Bash e Docker. `.gitattributes` mantém scripts shell em LF. O runner de interface sobe produção na porta 3110 e encerra seu próprio processo ao concluir. Pode-se definir `CHROMIUM_PATH` para um Chromium já instalado. `e2e/a2.mjs` também aceita `E2E_BASE_URL`.

A suite A2 cobre campos inválidos, senha obrigatória/divergente, mostrar senha, todas as transições e retorno, reordenação, recuperação após reload, preservação de filtros, falha de persistência, histórico, teclado, eventos reais de toque via Chromium, filtros de conversa, intervenção humana, encerramento, follow-up e ausência de overflow/erros nas seis telas. `tests/a2-pipeline.sql` valida ordenação, auditoria, tarefas de transição, ausência de duplicação e rejeição entre tenants no PostgreSQL.

## Dependências externas ainda não homologadas

Não foram fornecidos projeto/credenciais Supabase, contas Meta ou serviço generativo de IA. Login real, envio de recuperação, entrega de convite, conversas reais e envio oficial continuam dependendo da configuração e homologação externa. Os adaptadores e workers existentes não foram apresentados como integrações ativas. Sugestão de resposta na demonstração é texto de exemplo identificado; no modo integrado informa a ausência do serviço.

A inbox carrega os dados pela API; não há assinatura Realtime/WebSocket nesta entrega. Webhooks existentes persistem os eventos, mas uma atualização da página é necessária para buscar novas mensagens. Upload de anexos e edição visual completa de pipelines personalizados também permanecem pendentes. Esses itens não são simulados como integrações concluídas.

Referências técnicas consultadas: [Sortable do dnd-kit](https://dndkit.com/legacy/presets/sortable/overview/) e [recuperação de senha do Supabase](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

Resultado da execução local em 14/11/2026: 70 testes unitários aprovados (12 arquivos), lint sem avisos/erros, TypeScript e build de produção aprovados. Todas as migrations e suítes SQL passaram em PostgreSQL 17 descartável. As suítes Playwright de demonstração, onboarding e A2 passaram em produção local, incluindo mouse, teclado, touch e capturas de seis telas em três larguras. Autenticação/e-mail/Meta/IA externos não foram exercitados sem credenciais.
