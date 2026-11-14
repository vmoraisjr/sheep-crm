import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWhatsAppAdapter } from '@/lib/channels/whatsapp/configured';
import { sendInstagramReply } from '@/lib/channels/instagram/send';
import { SafeRetryError, type FollowupTransport } from './scheduler';
export function configuredFollowupTransport(db:SupabaseClient):FollowupTransport {
 return {async send(job){
  if(job.channelKind==='instagram'){
   if(!process.env.INSTAGRAM_APP_ID||!process.env.INSTAGRAM_APP_SECRET)throw new SafeRetryError('Instagram disconnected');
   return sendInstagramReply({organizationId:job.organizationId,channelId:job.channelId,recipientId:job.recipientId,text:job.text,idempotencyKey:job.idempotencyKey});
  }
  let adapter;
  try{adapter=await getWhatsAppAdapter(db,job.organizationId,job.channelId);}catch{throw new SafeRetryError('WhatsApp disconnected');}
  const {data,error}=await db.from('automation_settings').select('config').eq('organization_id',job.organizationId).single();
  const estimatedCost=Number(data?.config?.estimatedMessageCostMicros),remainingBudget=Number(data?.config?.remainingCostBudgetMicros);
  if(error||!Number.isFinite(estimatedCost)||!Number.isFinite(remainingBudget)||estimatedCost<0||remainingBudget<estimatedCost)throw new SafeRetryError('WhatsApp cost budget unavailable');
  const result=await adapter.send(job.recipientId,job.template?{type:'template',...job.template}:{type:'text',text:job.text},{consent:job.consent,optedOut:job.optedOut,lastInboundAt:job.lastInboundAt,estimatedCost,remainingBudget});
  return {providerMessageId:result.providerMessageId,origin:'meta' as const};
 }};
}
