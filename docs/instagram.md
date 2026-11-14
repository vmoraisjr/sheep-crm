# Instagram Messaging — issue #4

**Estado verificado nesta entrega: adaptador oficial implementado, sem conexão real validada.** Nenhuma credencial, conta profissional/tester, permissão ou app review foi fornecida. A inbox demo usa dados `origin=simulated`; não comprova integração Meta. Não há scraping nem biblioteca não oficial.

Usa Instagram API with Instagram Login: autorização `https://www.instagram.com/oauth/authorize`, troca inicial `https://api.instagram.com/oauth/access_token`, API `https://graph.instagram.com/{META_GRAPH_VERSION}`. Scopes `instagram_business_basic,instagram_business_manage_messages`. Configure uma versão suportada explícita; revise a documentação oficial antes do piloto: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login e https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api . Conta BUSINESS ou MEDIA_CREATOR necessária. Apps em development precisam usuários/contas tester autorizados; outros clientes exigem permissões/Advanced Access aprovados. A aceitação de token/inscrição não equivale a aprovação de piloto.

## Configuração e conexão

Aplicar migrations em ordem. Configurar no servidor (nunca NEXT_PUBLIC): `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI` HTTPS exato da callback `/api/integrations/instagram/callback`, `META_GRAPH_VERSION`, `INSTAGRAM_STATE_SECRET` (>=32 chars aleatórios), `INSTAGRAM_ENCRYPTION_KEY` (32 bytes aleatórios base64), `INSTAGRAM_VERIFY_TOKEN` e `SUPABASE_SERVICE_ROLE_KEY`. Supabase URL usa `NEXT_PUBLIC_SUPABASE_URL`. Sem configuração completa endpoints retornam disconnected/503. Não há fallback de real para simulado.

Admin/owner autenticado faz POST same-origin `/api/integrations/instagram/connect`; abre URL retornada. State tem assinatura HMAC, expira em 10min, liga usuário e organização e tem nonce persistido/consumido atomicamente. Callback valida conta profissional, obtém token longo, assina `messages,messaging_seen` e provisiona canal/credencial de forma atômica. Tokens AES-256-GCM com organization_id como AAD; tabelas de credenciais/nonce/jobs/outbound são service-only com RLS, sem leitura pelo navegador. Um account_id não pode pertencer a duas empresas.

Configure webhook público HTTPS `/api/webhooks/instagram/{connection-id}` usando ID da conexão provisionada. Challenge exige token, POST exige assinatura SHA256 sobre corpo original, máximo 1MiB. Conta/tenant vêm da conexão persistida, jamais do body. Eventos echo ou de conta diferente são ignorados. Recebimento só responde 200 após persistência durável; duplicatas ignoradas por connection/event key.

Um worker confiável usando service role chama `process_instagram_jobs(50)` a cada minuto. `FOR UPDATE SKIP LOCKED`, até 5 tentativas com backoff, ingestão/completion transacionais. Ingestão usa `ingest_inbound`; status `read` atualiza mensagens da mesma organização/canal. Jobs failed após 5 tentativas precisam inspeção manual sem expor PII. Agendar worker é dependência operacional; não foi implantado nesta entrega.

`sendInstagramReply` é server-only e deve receber organizationId de `requireTenant`, nunca do body. Busca conversa/consentimento atual, impõe janela de resposta de 24h, bloqueia opt-out, não assume disparos proativos fora da janela. Templates WA não são válidos no IG. Texto 1–1000 caracteres nesta versão. Reserva idempotente por organização/canal/chave antes de enviar; falha de rede ambígua mantém pending e exige reconciliação, sem reenvio automático. Operador deve reconciliar manualmente via provider ID/auditoria; não prometer exactly-once da API remota.

POST admin same-origin `/api/integrations/instagram/refresh` renova conexões com expiração em até 7 dias; tokens expirados/revogados passam a reconnect_required. Tokens longos requerem pelo menos 24h antes de refresh. Agende manutenção autenticada ou executor server com a mesma função antes da expiração. Reconexão repete OAuth; não reutilizar token expirado.

## Roteiro real pendente

1. Registrar app e conta profissional tester; obter permissões e callback HTTPS aprovado.
2. Conectar tenant A; confirmar encrypted_token e canal connected, sem imprimir token.
3. Assinar webhook no dashboard Meta; enviar Direct de tester; confirmar fila, worker, mensagem `origin=meta` na inbox.
4. Responder na janela; confirmar message_id real e seen; repetir webhook e chave outbound para verificar ausência de duplicata.
5. Testar tenant B sem acesso a A, assinatura adulterada, opt-out, janela expirada, revogação e reconexão.
6. Só liberar piloto após registrar evidências reais e revisar restrições/permissões atuais. Pendências externas não são testes aprovados.

Retenção: jobs concluídos contêm mensagens normalizadas e devem ser removidos segundo política do tenant. Remover estados OAuth expirados diariamente; excluir credenciais/jobs/receipts ao desconectar/excluir tenant; registrar auditoria sem token ou conteúdo de Direct. Restore exige mesma chave de criptografia; rotação deve descriptografar/recriptografar no servidor em operação controlada.

Worker HTTP opcional: configurar `INSTAGRAM_WORKER_SECRET` aleatório >=32 caracteres e agendar POST `/api/internal/instagram-worker` com `Authorization: Bearer <secret>` a cada minuto. Não expor segredo no navegador. O endpoint chama a mesma função SQL e retorna apenas quantidade processada; ausência de segredo/configuração falha fechada (503).
