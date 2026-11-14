import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenant } from '@/lib/auth/tenant';
import { stages } from '@/lib/crm/model';
export async function GET(){
 const {supabase,organizationId}=await requireTenant();
 const [opportunities,contacts,pending,followups]=await Promise.all([
  supabase.from('opportunities').select('*').eq('organization_id',organizationId).order('created_at',{ascending:false}),
  supabase.from('contacts').select('id,name,tags').eq('organization_id',organizationId),
  supabase.from('conversations').select('id',{count:'exact',head:true}).eq('organization_id',organizationId).eq('unanswered',true),
  supabase.from('followups').select('id',{count:'exact',head:true}).eq('organization_id',organizationId).in('status',['pending','claimed']),
 ]);
 if([opportunities,contacts,pending,followups].some(item=>item.error))return NextResponse.json({error:'CRM indisponível.'},{status:503});
 return NextResponse.json({opportunities:(opportunities.data??[]).map(item=>({id:item.id,contactId:item.contact_id,name:contacts.data?.find(contact=>contact.id===item.contact_id)?.name??'Contato',stage:item.stage,assignee:item.assignee??'',nextAction:item.next_action,valueCents:item.value_cents,tags:contacts.data?.find(contact=>contact.id===item.contact_id)?.tags??[]})),pending:pending.count??0,followups:followups.count??0},{headers:{'Cache-Control':'private, no-store'}});
}
const input=z.object({id:z.uuid(),stage:z.enum(stages).optional(),assignee:z.literal('self').optional(),nextAction:z.string().max(2000).optional(),valueCents:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),tags:z.array(z.string().trim().min(1).max(100)).max(20).optional()});
export async function PATCH(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403});
 const {supabase,organizationId}=await requireTenant();const parsed=input.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Dados inválidos.'},{status:400});
 const {id,...patch}=parsed.data;
 const {error}=await supabase.rpc('update_crm_opportunity',{p_organization_id:organizationId,p_id:id,p_patch:patch});
 if(error)return NextResponse.json({error:'Oportunidade não pôde ser atualizada.'},{status:409});
 return NextResponse.json({ok:true});
}
