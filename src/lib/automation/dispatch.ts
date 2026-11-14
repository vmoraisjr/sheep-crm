import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWhatsAppAdapter } from '@/lib/channels/whatsapp/configured';
import { sendInstagramReply } from '@/lib/channels/instagram/send';
/** No network retry after acceptance may be possible. Ambiguous results are quarantined. */
export async function dispatchAutomationOutbox(db:SupabaseClient){
 const {data:jobs,error}=await db.rpc('claim_automation_outbox');if(error)throw error;
 const results:Array<{id:string;status:string}>=[];
 for(const job of jobs??[]){
  let status='cancelled',providerId:string|undefined;
  try{
   const [conversation,profile]=await Promise.all([db.from('conversations').select('*,contacts(*)').eq('organization_id',job.organization_id).eq('id',job.conversation_id).single(),db.from('onboarding_profiles').select('agent_enabled,approved_at,revision,approved_revision').eq('organization_id',job.organization_id).single()]);
   if(conversation.error||profile.error)throw new Error('Context unavailable');
   const c=conversation.data,p=profile.data;
   if(c.ai_paused||!c.contacts.opted_in||c.contacts.opted_out||!p.agent_enabled||!p.approved_at||p.revision!==p.approved_revision){status='cancelled';}
   else if(c.channel_kind==='instagram'){
    const result=await sendInstagramReply({organizationId:job.organization_id,channelId:c.channel_id,recipientId:c.contacts.external_id,text:job.text,idempotencyKey:`automation:${job.id}`});
    providerId=result.providerMessageId;status='sent';
   }else{
    const adapter=await getWhatsAppAdapter(db,job.organization_id,c.channel_id);
    const settings=await db.from('automation_settings').select('config').eq('organization_id',job.organization_id).single();
    const estimatedCost=Number(settings.data?.config?.estimatedMessageCostMicros),remainingBudget=Number(settings.data?.config?.remainingCostBudgetMicros);
    if(settings.error||!Number.isFinite(estimatedCost)||estimatedCost<0||!Number.isFinite(remainingBudget)||remainingBudget<estimatedCost)throw new Error('Cost guard unavailable');
    const result=await adapter.send(c.contacts.external_id,{type:'text',text:job.text},{consent:c.contacts.opted_in,optedOut:c.contacts.opted_out,lastInboundAt:c.last_inbound_at,estimatedCost,remainingBudget});
    providerId=result.providerMessageId;status='sent';
   }
  }catch{status='uncertain';}
  const updated=await db.from('automation_outbox').update({status,provider_message_id:providerId??null}).eq('organization_id',job.organization_id).eq('id',job.id).eq('status','sending');
  if(updated.error)throw updated.error;
  results.push({id:job.id,status});
 }
 return results;
}
