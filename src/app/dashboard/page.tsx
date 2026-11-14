import { CRM } from '@/components/crm';
import { requireTenant } from '@/lib/auth/tenant';
export default async function DashboardPage(){await requireTenant();return <CRM dashboard/>;}
