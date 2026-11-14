import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AutomationRepository } from './service';
import type { AutomationConfig, AutomationDecision, AutomationInput } from './engine';
export function automationServiceClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Automation worker requires configured Supabase service credentials');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export class SupabaseAutomationRepository implements AutomationRepository {
 constructor(private readonly db: SupabaseClient) {}
 async claim(org:string,message:string) { const {data,error}=await this.db.rpc('claim_automation',{p_org:org,p_message:message});if(error)throw error;return data===true; }
 async loadInput(org:string,conversation:string,message:string):Promise<AutomationInput> {
  const [c,m,s,p,u,r]=await Promise.all([
   this.db.from('conversations').select('*,contacts(*)').eq('organization_id',org).eq('id',conversation).single(),
   this.db.from('messages').select('*').eq('organization_id',org).eq('conversation_id',conversation).eq('id',message).eq('direction','inbound').single(),
   this.db.from('automation_settings').select('config').eq('organization_id',org).maybeSingle(),
   this.db.from('onboarding_profiles').select('*').eq('organization_id',org).maybeSingle(),
   this.db.from('usage_events').select('kind,quantity').eq('organization_id',org),
   this.db.from('automation_decisions').select('decision').eq('organization_id',org).eq('status','committed').gte('claimed_at',new Date(Date.now()-3600000).toISOString())
  ]);
  for(const result of [c,m,s,p,u,r]) if(result.error)throw result.error;
  const config:AutomationConfig={agentApproved:false,openHour:9,closeHour:18,timeZone:'America/Sao_Paulo',maxRepliesPerHour:10,tokenLimit:10000,usageLimit:100,limitMode:'hard',...s.data?.config};
  config.agentApproved=Boolean(p.data?.agent_enabled && p.data?.approved_at && p.data?.approved_revision===p.data?.revision);
  // Wizard FAQ is supplied text; only explicit Q: / A: pairs become approved answers.
  const faq=String(p.data?.draft?.faq??'');
  const knowledge=Array.from(faq.matchAll(/(?:^|\n)Q:\s*([^\n]+)\nA:\s*([^\n]+)/g), (match,index)=>({id:`${p.data?.revision}:${index}`,question:match[1],answer:match[2],approved:config.agentApproved}));
  return {organizationId:org,conversationId:conversation,messageId:message,text:m.data.text,humanPaused:c.data.ai_paused,optOut:c.data.contacts.opted_out,consent:c.data.contacts.opted_in,knowledge,config,usedTokens:(u.data??[]).filter(x=>x.kind==='tokens').reduce((sum,x)=>sum+x.quantity,0),usedReplies:(u.data??[]).filter(x=>x.kind==='automated_conversation').reduce((sum,x)=>sum+x.quantity,0),repliesThisHour:(r.data??[]).filter(x=>x.decision?.action==='reply').length,firstMessage:false,now:new Date()};
 }
 async commit(input:AutomationInput,decision:AutomationDecision):Promise<AutomationDecision>{const {data,error}=await this.db.rpc('commit_automation',{p_org:input.organizationId,p_message:input.messageId,p_decision:decision});if(error)throw error;return data;}
 async fail(org:string,message:string){const {error}=await this.db.from('automation_decisions').update({status:'failed'}).eq('organization_id',org).eq('message_id',message).eq('status','claimed');if(error)throw error;}
}
