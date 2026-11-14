# Domínio e canais (#2)

`src/lib/domain/types.ts` é o contrato compartilhado. A aplicação normaliza mensagens WhatsApp/Instagram antes de persistir; `providerMessageId`, origem e timestamp original são preservados. Status de entrega não são mensagens de entrada e devem ser processados pelo adaptador específico. Nunca aceite `organizationId` enviado pelo navegador: derive-o de `requireTenant()` ou da configuração autenticada do canal no worker.

`SupabaseDomainRepository(client, organizationId)` é a persistência real. `ingest()` chama `ingest_inbound`: transação atômica com bloqueio por chave de entrega, constraint única `(organization_id, channel_id, provider_message_id)`, um contato/conversa por identidade de canal, lead sem duplicação e cancelamento de follow-ups pendentes ao receber resposta. Chaves estrangeiras compostas impedem associar entidades de organizações distintas. Todas as onze tabelas têm RLS por membership. Uma pessoa em dois canais não é fundida automaticamente: IDs de Instagram e números WhatsApp pertencem a namespaces distintos.

`MemoryDomainRepository` e `SimulatedChannelAdapter` são **simulados**, efêmeros e exclusivos de desenvolvimento/testes. Não integram Meta, não persistem entre reinícios e não confirmam entrega real. Os adapters oficiais ficam nos módulos de cada canal (#3/#4). O repositório simulado conserva as mesmas fronteiras tenant e chaves de idempotência para testes de contrato.

Aplicar migrations em ordem: `0001_foundation.sql`, `0002_domain.sql`. Testes de domínio: `npm test -- tests/domain.test.ts`; testes SQL contra PostgreSQL/Supabase devem validar RLS e concorrência da RPC. Credenciais Supabase e Meta não foram fornecidas, portanto testes de sandbox Meta permanecem bloqueados; mocks não constituem evidência de integração real.
