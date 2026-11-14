import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { FollowupJob, FollowupRepository } from './scheduler';
const rowSchema=z.object({id:z.string(),claim_token:z.string(),organization_id:z.string(),conversation_id:z.string(),opportunity_id:z.string(),idempotency_key:z.string(),due_at:z.string(),created_at:z.string(),attempts:z.number(),payload:z.object({text:z.string().default(''),template:z.object({name:z.string(),language:z.string(),approved:z.boolean()}).optional()})});
export class SupabaseFollowupRepository implements FollowupRepository {
 constructor(private readonly db:SupabaseClient){}
 private async hydrate(row:unknown):Promise<FollowupJob>{
  const f=rowSchema.parse(row);
  const [c,o]=await Promise.all([this.db.from('conversations').select('*,contacts(*)').eq('organization_id',f.organization_id).eq('id',f.conversation_id).single(),this.db.from('opportunities').select('stage').eq('organization_id',f.organization_id).eq('id',f.opportunity_id).single()]);
  if(c.error||o.error)throw c.error??o.error;
  return {id:f.id,claimToken:f.claim_token,organizationId:f.organization_id,conversationId:f.conversation_id,opportunityId:f.opportunity_id,idempotencyKey:f.idempotency_key,channelKind:c.data.channel_kind,channelId:c.data.channel_id,recipientId:c.data.contacts.external_id,dueAt:f.due_at,createdAt:f.created_at,lastInboundAt:c.data.last_inbound_at,consent:c.data.contacts.opted_in,optedOut:c.data.contacts.opted_out,humanPaused:c.data.ai_paused,opportunityStage:o.data.stage,attempts:f.attempts,text:f.payload.text,template:f.payload.template};
 }
 async claim(now:Date,limit:number){const {data,error}=await this.db.rpc('claim_followups',{p_now:now.toISOString(),p_limit:limit});if(error)throw error;return Promise.all((data??[]).map((row:unknown)=>this.hydrate(row)));}
 async prepare(job:FollowupJob,now:Date){const {data,error}=await this.db.rpc('prepare_followup',{p_org:job.organizationId,p_id:job.id,p_token:job.claimToken,p_now:now.toISOString()});if(error)throw error;if(!data)return null;const result=await this.db.from('followups').select('*').eq('organization_id',job.organizationId).eq('id',job.id).single();if(result.error)throw result.error;return this.hydrate(result.data);}
 private async update(job:FollowupJob,values:Record<string,unknown>,action:string){const {error}=await this.db.from('followups').update(values).eq('organization_id',job.organizationId).eq('id',job.id).eq('claim_token',job.claimToken).in('status',['claimed','sending']);if(error)throw error;const audit=await this.db.from('followup_audit').insert({organization_id:job.organizationId,followup_id:job.id,action,reason:values.last_error??null});if(audit.error)throw audit.error;}
 async cancel(job:FollowupJob,reason:string){await this.update(job,{status:'cancelled',last_error:reason},'cancelled');}
 async complete(job:FollowupJob,providerId:string,origin:'meta'|'simulated'){const {error}=await this.db.rpc('complete_followup',{p_org:job.organizationId,p_id:job.id,p_token:job.claimToken,p_provider:providerId,p_origin:origin,p_last_inbound:job.lastInboundAt});if(error)throw error;}
 async fail(job:FollowupJob,status:'pending'|'failed'|'uncertain',reason:string,retryAt:Date){await this.update(job,{status,last_error:reason,due_at:retryAt.toISOString(),lease_until:null},status);}
}
