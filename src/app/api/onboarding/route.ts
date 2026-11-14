import {NextResponse} from 'next/server';
import {requireTenant} from '@/lib/auth/tenant';
import {validateDraft} from '@/lib/onboarding/model';
export async function GET(){
 const {supabase,organizationId}=await requireTenant();
 const {data,error}=await supabase.from('onboarding_profiles').select('*').eq('organization_id',organizationId).maybeSingle();
 if(error)return NextResponse.json({error:'Não foi possível carregar o onboarding'},{status:500});
 return NextResponse.json({profile:data});
}
export async function POST(request:Request){
 if (request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin) return NextResponse.json({error:'Origem inválida'},{status:403});
 const {supabase,organizationId,role}=await requireTenant();
 if(!['owner','admin'].includes(role))return NextResponse.json({error:'Somente administrador pode aprovar conteúdo'},{status:403});
 let body;
 try {body=await request.json();}catch{return NextResponse.json({error:'JSON inválido'},{status:400});}
 if(!Number.isInteger(body.revision)||body.revision<0)return NextResponse.json({error:'Revisão inválida'},{status:400});
 let rpc;
 try {
  if(body.action==='save')rpc=supabase.rpc('save_onboarding',{p_organization_id:organizationId,p_draft:validateDraft(body.draft),p_expected_revision:body.revision});
  else if(body.action==='approve')rpc=supabase.rpc('approve_onboarding',{p_organization_id:organizationId,p_expected_revision:body.revision});
  else return NextResponse.json({error:'Ação inválida'},{status:400});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Dados inválidos'},{status:400});}
 const {data,error}=await rpc;
 if(error)return NextResponse.json({error:'Conflito de revisão ou operação não permitida. Recarregue os dados.'},{status:409});
 return NextResponse.json({profile:data});
}
