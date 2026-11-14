import {NextResponse} from 'next/server';
import {requireTenant} from '@/lib/auth/tenant';
export async function GET(){
 const {supabase,organizationId}=await requireTenant();
 // Aggregate in SQL: PostgREST pagination must not truncate metering reports.
 const {data,error}=await supabase.rpc('usage_summary',{p_org:organizationId});
 if(error)return NextResponse.json({error:'Falha ao carregar medição'},{status:500});
 return NextResponse.json(data);
}
