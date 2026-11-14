import { Inbox } from '@/components/inbox';
import { requireTenant } from '@/lib/auth/tenant';
export default async function InboxPage() { await requireTenant(); return <Inbox />; }
