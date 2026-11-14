import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenant } from '@/lib/auth/tenant';
const schema=z.object({conversationId:z.uuid(),opportunityId:z.uuid(),dueAt:z.iso.datetime(),idempotencyKey:z.string().min(1).max(160),text:z.string().min(1).max(4000)}).strict();
export async function POST(request:Request){
 const {supabase,organizationId,role}=await requireTenant();
 if(role==='member')return NextResponse.json({error:'Admin role required'},{status:403});
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success||Date.parse(input.data.dueAt)<=Date.now())return NextResponse.json({error:'Invalid schedule'},{status:400});
 // Only text scheduling through public API. Approved templates are provisioned server-side after Meta review.
 const {data,error}=await supabase.from('followups').insert({organization_id:organizationId,conversation_id:input.data.conversationId,opportunity_id:input.data.opportunityId,due_at:input.data.dueAt,idempotency_key:input.data.idempotencyKey,payload:{text:input.data.text}}).select('id,status');
 if(error)return NextResponse.json({error:'Unable to schedule follow-up'},{status:400});
 return NextResponse.json({jobs:data},{status:201});
}
