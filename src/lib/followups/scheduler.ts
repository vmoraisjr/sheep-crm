import type { ChannelKind } from '../domain/types';
export interface FollowupJob {
 id:string; organizationId:string; conversationId:string; opportunityId:string; idempotencyKey:string;
 channelKind:ChannelKind; channelId:string; recipientId:string; dueAt:string; createdAt:string;
 lastInboundAt:string; consent:boolean; optedOut:boolean; humanPaused:boolean;
 opportunityStage:string; attempts:number; text:string; template?:{name:string;language:string;approved:boolean};
}
export function followupBlockReason(job:FollowupJob,now:Date):string|null {
 if(job.optedOut||!job.consent)return 'consent_required';
 if(job.humanPaused)return 'human_priority';
 if(['won','lost'].includes(job.opportunityStage))return 'opportunity_closed';
 if(Date.parse(job.lastInboundAt)>Date.parse(job.createdAt))return 'customer_replied';
 const age=now.getTime()-Date.parse(job.lastInboundAt);
 if(!Number.isFinite(age)||age<0)return 'invalid_window';
 if(age>=86400000 && (job.channelKind==='instagram'||!job.template?.approved))return 'outside_window';
 if(!job.text.trim()&&!job.template)return 'empty_message';
 return null;
}
export interface FollowupRepository {
 claim(now:Date,limit:number):Promise<FollowupJob[]>;
 /** Revalidate persisted consent, opportunity, inbound time and lease; atomic claimed->sending. */
 prepare(job:FollowupJob,now:Date):Promise<FollowupJob|null>;
 cancel(job:FollowupJob,reason:string):Promise<void>;
 complete(job:FollowupJob,providerId:string,origin:'meta'|'simulated'):Promise<void>;
 fail(job:FollowupJob,state:'pending'|'failed'|'uncertain',reason:string,retryAt:Date):Promise<void>;
}
export interface FollowupTransport { send(job:FollowupJob):Promise<{providerMessageId:string;origin:'meta'|'simulated'}> }
/** Only errors positively known to precede provider acceptance are retried. */
export class SafeRetryError extends Error {}
export async function runFollowups(repository:FollowupRepository,transport:FollowupTransport,now=new Date(),limit=25) {
 const jobs=await repository.claim(now,Math.max(1,Math.min(limit,100)));
 const outcomes: Array<{id:string;status:string}>=[];
 for(const claimed of jobs){
  const blocked=followupBlockReason(claimed,now);
  if(blocked){await repository.cancel(claimed,blocked);outcomes.push({id:claimed.id,status:'cancelled'});continue;}
  const job=await repository.prepare(claimed,now);
  if(!job){outcomes.push({id:claimed.id,status:'cancelled'});continue;}
  const lastCheck=followupBlockReason(job,now);
  if(lastCheck){await repository.cancel(job,lastCheck);outcomes.push({id:job.id,status:'cancelled'});continue;}
  try {const sent=await transport.send(job);await repository.complete(job,sent.providerMessageId,sent.origin);outcomes.push({id:job.id,status:'sent'});}
  catch(error){const retry=error instanceof SafeRetryError&&job.attempts<5;const state=retry?'pending':error instanceof SafeRetryError?'failed':'uncertain';await repository.fail(job,state,error instanceof Error?error.name:'send_error',new Date(now.getTime()+Math.min(3600000,30000*2**job.attempts)));outcomes.push({id:job.id,status:state});}
 }
 return outcomes;
}
