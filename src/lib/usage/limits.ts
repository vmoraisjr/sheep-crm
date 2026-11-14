export type LimitMode='soft'|'hard';
export interface UsageReport{organizationId:string;period:string;automatedConversations:number;messages:number;tokens:number;costMicros:number;limit:number;mode:LimitMode;exceeded:boolean;remaining:number;billingEnabled:false}
export interface MeterEvent{organization_id:string;event_key:string;kind:'automated_conversation'|'message'|'tokens';quantity:number;cost_micros:number;created_at:string}
export function usageReport(organizationId:string,events:MeterEvent[],limit:number,mode:LimitMode,now=new Date()):UsageReport{
 if(!Number.isSafeInteger(limit)||limit<0)throw new Error('Invalid plan limit');
 const period=now.toISOString().slice(0,7),seen=new Set<string>();
 const report:UsageReport={organizationId,period,automatedConversations:0,messages:0,tokens:0,costMicros:0,limit,mode,exceeded:false,remaining:limit,billingEnabled:false};
 for(const event of events){
  if(event.organization_id!==organizationId||event.created_at.slice(0,7)!==period||seen.has(event.event_key))continue;
  if(!Number.isSafeInteger(event.quantity)||event.quantity<0||!Number.isSafeInteger(event.cost_micros)||event.cost_micros<0)throw new Error('Invalid usage event');
  seen.add(event.event_key);
  if(event.kind==='automated_conversation')report.automatedConversations+=event.quantity;
  if(event.kind==='message')report.messages+=event.quantity;
  if(event.kind==='tokens')report.tokens+=event.quantity;
  report.costMicros+=event.cost_micros;
 }
 report.exceeded=report.automatedConversations>=limit;
 report.remaining=Math.max(0,limit-report.automatedConversations);
 return report;
}
