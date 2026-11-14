# Operação e pilotos (#10)

## Estado e preparação

Este repositório entrega software e demonstrações simuladas. Não há homologação de produção Meta nem pilotos reais concluídos. Não usar o termo “conectado” antes de testar a conta correspondente. Nenhuma cobrança foi implementada.

1. `npm ci`, copiar `.env.example` e configurar projeto Supabase separado por ambiente. Nunca versionar segredos.
2. Aplicar `supabase/migrations` em ordem. Executar `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e os testes SQL em banco descartável. Nunca executar bootstrap de testes em produção.
3. Criar três usuários de teste, cada um com sua organização pelo onboarding autenticado. Não reutilizar telefone, identificador de canal ou credenciais entre empresas.
4. Em cada organização, fornecer documentos, produtos, horários e FAQ com pares explícitos `Q: pergunta` / `A: resposta`. Aprovar a revisão como owner/admin. Alterar conteúdo revoga aprovação.
5. Percorrer `/demo` e `/onboarding?mode=demo`; estes fluxos são simulados e não provam integração externa.
6. Configurar `tenant_plans` (owner/admin) com `monthly_limit` e `limit_mode` `soft` ou `hard`. O relatório `/usage` e `/api/usage` pertence à organização autenticada. Não há endpoint público de escrita de uso.

## Meta oficial

Consulte `whatsapp.md` e `instagram.md` para variáveis e endpoints exatos. Exige aplicativo Meta, contas elegíveis, credenciais server-side, URL HTTPS pública para webhook, assinatura verificada e permissões concedidas. Tokens devem ser criptografados por tenant usando chave fora do banco. Um desafio GET bem-sucedido não comprova recebimento/envio de mensagens.

WhatsApp: obter WABA e phone number ID válidos, consentimento verificável, destinatário sandbox/tester autorizado. Testar entrada e resposta dentro da janela, template aprovado fora dela, opt-out e callbacks de status. Meta cobra segundo sua tabela atual; custos locais registrados não são faturas Meta.

Instagram: conta profissional elegível, OAuth e permissões aprovadas para o método de login escolhido, tester aceito, webhook assinado. Testar entrada e resposta na mesma inbox. Não realizar scraping, não presumir envio proativo fora da janela e não usar permissão de resposta humana para automação.

Bloqueios atuais: credenciais, contas, permissões/App Review, domínio webhook público e homologação sandbox não fornecidos. Apenas adaptadores simulados e testes com transporte falso podem ser executados sem esses recursos.

## Checklist por piloto (repetir A, B, C)

- [ ] Empresa e responsável identificados; base legal/consentimento registrados; canal oficial elegível.
- [ ] Conta própria e segredo criptografado próprio; webhook roteado pelo ID da conta, nunca por tenant vindo de payload arbitrário.
- [ ] Usuário A não vê dados B/C em REST, SQL ou UI. Testar ID de recurso de outro tenant.
- [ ] Aprovação de conhecimento explícita; pergunta desconhecida/reclamação transfere para humano.
- [ ] Webhook repetido não duplica contato/mensagem/uso; status fora de ordem não regride.
- [ ] Resposta manual, pausa IA e atribuição têm prioridade sobre automação.
- [ ] Opt-out cancela follow-up. Resposta nova cancela job. Fora da janela exige política/template correto.
- [ ] Limite hard impede nova unidade; soft registra excedente; repetir evento não duplica uso.
- [ ] Interromper worker e reiniciar; job reclamado recupera lease. Resultado remoto incerto exige reconciliação e não reenvio cego.
- [ ] Evidência sandbox: IDs mascarados, horário, request/response sanitizados, origem real identificada. Não incluir token ou texto pessoal nos PRs.
- [ ] Aprovação humana para liberar piloto; rollback ensaiado.

Nenhuma caixa acima está marcada como executada em conta Meta real.

## LGPD e retenção

O cliente é responsável pela finalidade/base legal; operadores devem limitar acesso por organização e função. Não importar contatos sem base legal. Consentimento e opt-out devem ser auditáveis com origem e horário. Não registrar tokens, documentos pessoais ou conteúdo integral em logs operacionais. Coletar apenas o necessário para atendimento.

Política inicial a confirmar com cada controlador: mensagens, filas e decisões por 90 dias; agregados de uso sem conteúdo por 12 meses; evidência de consentimento/opt-out por prazo legal validado pelo responsável jurídico. Estes prazos são proposta operacional, não parecer jurídico. A aplicação não executa expurgo automático silencioso. Agendar rotina controlada com relatório prévio e aprovação do controlador; apagar objetos de mídia também; manter supressão de opt-out mínima para não recontatar indevidamente. Atender exportação/exclusão por tenant, registrar solicitação e verificação de identidade. Backups têm prazo próprio e acesso restrito.

## Rollback e incidentes

Pausar workers e todos agentes/canais antes de reverter. Preservar filas e status `uncertain` para reconciliação. Reimplantar última versão conhecida, sem desfazer migrations destrutivamente. Backup verificado antes de cada migration; restaurar em ambiente isolado e validar RLS antes de substituir produção. Revogar token comprometido na Meta, rotacionar chave de criptografia com recriptografia controlada e auditar acessos. Nunca repetir envio incerto automaticamente durante rollback. Reativar uma organização por vez depois de teste manual.

## Evidências reproduzíveis

`tests/postgres-bootstrap.sql` simula somente a camada Auth mínima para PostgreSQL descartável; não equivale ao serviço Supabase hospedado. Testes unitários exercitam políticas e transportes falsos. Testes SQL exercitam migrations e RLS reais no PostgreSQL. E2E de navegador cobre a demonstração. Autenticação hospedada e Meta real continuam dependências externas.
