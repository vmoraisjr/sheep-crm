# Follow-up persistente e compliance (#8)

Agende texto pelo `POST /api/followups` com sessão owner/admin e IDs do tenant. `idempotencyKey` único rejeita duplicação. O banco não concede a usuários permissão para modificar status/lease/tentativas. Não há campanhas nem cobrança real. Follow-up exige oportunidade aberta, opt-in e ausência de opt-out, pausa humana ou resposta posterior ao agendamento.

Execute `POST /api/internal/followups` periodicamente usando `Authorization: Bearer <FOLLOWUP_WORKER_SECRET>` (segredo aleatório >=32 caracteres), além de Supabase URL/service role. O worker obtém jobs via `FOR UPDATE SKIP LOCKED`, lease recuperável e valida consentimento/estado novamente antes de enviar. Ingestão inbound #2 cancela pending/claimed. Estados `sending` abandonados viram `uncertain`, nunca retry automático. Somente falhas comprovadamente anteriores à aceitação são retentadas com backoff até cinco tentativas. Erros de rede/resultado desconhecido exigem reconciliação; APIs Meta não oferecem uma chave geral de idempotência para todo envio.

WhatsApp: fora de 24h, requer template presente em `whatsapp_approved_templates`, validado por operador contra API oficial Meta nas últimas 24h. Essa tabela só pode ser escrita por service role; marcar `approved` no payload não autoriza envio. Provisionar credenciais criptografadas por tenant conforme #3 e `automation_settings.config.estimatedMessageCostMicros` e `remainingCostBudgetMicros` antes do worker. Sem credenciais ou orçamento, envio é bloqueado. Essa checagem de custo não é cobrança; configuração conservadora deve ser usada até piloto validado.

Instagram: nunca envia follow-up fora de 24h. Usa `sendInstagramReply`, adapter oficial e reserva durável #4; exige conta elegível, permissões e conexão ainda válidas. Não usa scraping. O endpoint worker não seleciona simulações automaticamente.

Auditoria em `followup_audit`; campos `provider_message_id` e status persistidos. Transporte simulado pode ser injetado apenas em testes via `FollowupTransport` e retorna `origin: simulated`. Testes de integração reais Meta dependem de credenciais, app review e permissões; ainda bloqueados. Lease reduz corridas, mas nenhuma transação local pode impedir revogação ocorrida entre a última checagem e a aceitação remota: reconciliar/auditar essa janela operacional.

24 testes automatizados do motor e scheduler cobrem opt-out, pausa humana, resposta posterior, oportunidade encerrada, política por canal, concorrência, retry seguro e resultado ambíguo. Configuração sem Meta não comprova fluxo sandbox real.
