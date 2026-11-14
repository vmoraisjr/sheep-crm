import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenant } from '@/lib/auth/tenant';
import { assertManualReply } from '@/lib/inbox/reply';
import { WhatsAppCloudAdapter, SimulatedWhatsAppAdapter } from '@/lib/channels/whatsapp/client';
import { decryptCredential } from '@/lib/channels/security';
import { instagramRuntime } from '@/lib/channels/instagram/runtime';
import { decryptToken } from '@/lib/channels/instagram/security';
const input = z.object({ text:z.string().trim().min(1).max(4096), idempotencyKey:z.uuid() });
export async function POST(request: Request, { params }: { params:Promise<{id:string}> }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({error:'Origem inválida.'},{status:403});
  const {supabase,organizationId}=await requireTenant();
  const parsed=input.safeParse(await request.json().catch(()=>null)); const {id}=await params;
  if(!parsed.success || !z.uuid().safeParse(id).success) return NextResponse.json({error:'Dados inválidos.'},{status:400});
  const {data:conversation}=await supabase.from('conversations').select('*').eq('organization_id',organizationId).eq('id',id).single();
  if(!conversation) return NextResponse.json({error:'Conversa não encontrada.'},{status:404});
  const [{data:channel},{data:contact}]=await Promise.all([
    supabase.from('channels').select('*').eq('organization_id',organizationId).eq('id',conversation.channel_id).single(),
    supabase.from('contacts').select('*').eq('organization_id',organizationId).eq('id',conversation.contact_id).single(),
  ]);
  if(!channel || !contact) return NextResponse.json({error:'Canal ou contato indisponível.'},{status:409});
  try { assertManualReply({status:channel.status,kind:channel.kind,optedIn:contact.opted_in,optedOut:contact.opted_out,lastInboundAt:conversation.last_inbound_at},parsed.data.text); }
  catch { return NextResponse.json({error:'Envio bloqueado: confira conexão, consentimento, tamanho e janela de 24 horas.'},{status:409}); }
  const {NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}=process.env;
  if(!url || !key) return NextResponse.json({error:'Processamento seguro indisponível.'},{status:503});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const requestKey=parsed.data.idempotencyKey;
  const {data:prior}=await db.from('manual_reply_requests').select('status,message_id').eq('organization_id',organizationId).eq('idempotency_key',requestKey).maybeSingle();
  if(prior) return NextResponse.json({status:prior.status,messageId:prior.message_id},{status:prior.status==='sent'?200:202});
  const messageId=crypto.randomUUID();
  const origin=channel.status==='simulated'?'simulated':'meta';
  // Persist before calling the provider. A concurrent duplicate fails the stable request-key insert.
  const {error:messageError}=await db.from('messages').insert({id:messageId,organization_id:organizationId,conversation_id:id,channel_id:channel.id,provider_message_id:`manual:${requestKey}`,direction:'outbound',text:parsed.data.text,occurred_at:new Date().toISOString(),origin,status:'pending'});
  if(messageError) return NextResponse.json({error:'Não foi possível registrar a tentativa.'},{status:409});
  const {error:claimError}=await db.from('manual_reply_requests').insert({organization_id:organizationId,idempotency_key:requestKey,conversation_id:id,message_id:messageId,status:'processing'});
  if(claimError) { await db.from('messages').delete().eq('organization_id',organizationId).eq('id',messageId); return NextResponse.json({error:'Tentativa já em processamento.'},{status:409}); }
  await db.from('conversations').update({ai_paused:true}).eq('organization_id',organizationId).eq('id',id);
  try {
    let providerMessageId:string;
    if(channel.kind==='whatsapp') {
      const policy={consent:contact.opted_in,optedOut:contact.opted_out,lastInboundAt:conversation.last_inbound_at,estimatedCost:0,remainingBudget:0};
      if(origin==='simulated') providerMessageId=(await new SimulatedWhatsAppAdapter().send(contact.external_id,{type:'text',text:parsed.data.text},policy)).providerMessageId;
      else {
        const {data:connection}=await db.from('whatsapp_connections').select('*').eq('organization_id',organizationId).eq('channel_id',channel.id).single();
        if(!connection || !process.env.META_CREDENTIAL_ENCRYPTION_KEY || !process.env.META_GRAPH_VERSION) throw new Error('configuration_missing');
        const token=decryptCredential(connection.encrypted_access_token,process.env.META_CREDENTIAL_ENCRYPTION_KEY,organizationId);
        providerMessageId=(await new WhatsAppCloudAdapter({phoneNumberId:connection.phone_number_id,accessToken:token,graphVersion:process.env.META_GRAPH_VERSION}).send(contact.external_id,{type:'text',text:parsed.data.text},policy)).providerMessageId;
      }
    } else if(origin==='simulated') providerMessageId=`simulated:instagram:${crypto.randomUUID()}`;
    else {
      const runtime=instagramRuntime();
      const {data:connection}=await db.from('instagram_connections').select('*').eq('organization_id',organizationId).eq('channel_id',channel.id).eq('status','connected').single();
      if(!runtime || !connection || Date.parse(connection.expires_at)<=Date.now()) throw new Error('reconnect_required');
      providerMessageId=(await runtime.client.send({accountId:connection.account_id,recipientId:contact.external_id,text:parsed.data.text,token:decryptToken(connection.encrypted_token,runtime.encryptionKey,organizationId),lastInboundAt:conversation.last_inbound_at,optedOut:contact.opted_out})).providerMessageId;
    }
    const {error:saved}=await db.from('messages').update({provider_message_id:providerMessageId,status:'sent'}).eq('organization_id',organizationId).eq('id',messageId);
    if(saved) throw new Error('delivery_persistence_unknown');
    await db.from('manual_reply_requests').update({status:'sent'}).eq('organization_id',organizationId).eq('idempotency_key',requestKey);
    await db.from('conversations').update({unanswered:false,ai_paused:true}).eq('organization_id',organizationId).eq('id',id);
    return NextResponse.json({status:'sent',origin,messageId,providerMessageId});
  } catch {
    await db.from('manual_reply_requests').update({status:'unknown'}).eq('organization_id',organizationId).eq('idempotency_key',requestKey);
    return NextResponse.json({status:'unknown',error:'Entrega não confirmada. Reconcilie o status antes de tentar novamente para evitar duplicatas.'},{status:202});
  }
}
