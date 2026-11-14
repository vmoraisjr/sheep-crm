export const dynamic = 'force-dynamic';
import { createOrganization } from './actions';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/config';
import { redirect } from 'next/navigation';
export default async function Onboarding({searchParams}:{searchParams:Promise<{error?:string}>}) {
  if(!hasSupabaseConfig()) redirect('/login');
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login');
  const {error}=await searchParams;
  return <main className="mx-auto max-w-lg p-8 pt-16"><h1 className="mb-6 text-3xl font-bold">Crie sua empresa</h1><form action={createOrganization} className="space-y-5">{error&&<p role="alert">Não foi possível criar a empresa. Verifique o nome e tente novamente.</p>}<label className="block">Nome da empresa<input name="name" minLength={2} maxLength={120} required /></label><button className="rounded-lg bg-indigo-700 p-3 text-white">Continuar</button></form></main>;
}
