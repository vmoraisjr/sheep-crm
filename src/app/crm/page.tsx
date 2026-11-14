import { CRM } from '@/components/crm';
import { requireTenant } from '@/lib/auth/tenant';
export default async function CRMPage(){await requireTenant();return <CRM/>;}
