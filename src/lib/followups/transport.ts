import type { ChannelAdapter } from '../domain/types';
import type { FollowupTransport, FollowupJob } from './scheduler';
/** A credential-aware factory must select by persisted tenant+channel, never request body. */
export function createChannelFollowupTransport(adapterFor:(organizationId:string,channelId:string)=>Promise<ChannelAdapter>):FollowupTransport {
 return {async send(job:FollowupJob){
  const adapter=await adapterFor(job.organizationId,job.channelId);
  if(adapter.kind!==job.channelKind)throw new Error('Channel mismatch');
  const result=await adapter.send({organizationId:job.organizationId,channelId:job.channelId,recipientId:job.recipientId,text:job.text,idempotencyKey:job.idempotencyKey,template:job.template?{name:job.template.name,language:job.template.language}:undefined});
  return {providerMessageId:result.providerMessageId,origin:result.origin};
 }};
}
