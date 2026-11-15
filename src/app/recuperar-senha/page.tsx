import { AuthForm } from '@/components/auth-form';
import { hasSupabaseConfig } from '@/lib/supabase/config';
export default function Page(){return <AuthForm mode="recovery" configured={hasSupabaseConfig()}/>}
