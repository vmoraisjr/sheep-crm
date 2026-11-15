import { AuthForm } from '@/components/auth-form';
import { hasSupabaseConfig } from '@/lib/supabase/config';
export default function Login(){return <AuthForm mode="login" configured={hasSupabaseConfig()}/>}
