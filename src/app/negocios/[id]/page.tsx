import { CRM } from '@/components/crm';
import { requireTenant } from '@/lib/auth/tenant';
export default async function Page({params}:{params:Promise<{id:string}>}){await requireTenant();return <CRM initialId={(await params).id}/>}
