export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { hasSupabaseConfig } from '@/lib/supabase/config';
import { requireTenant } from '@/lib/auth/tenant';
export default async function Home() {
  if(!hasSupabaseConfig()) return <main className="mx-auto max-w-3xl p-8 md:p-16"><p className="font-bold text-indigo-700">SHEEP CRM</p><h1 className="mt-6 text-4xl font-bold">Seu atendimento, em um só lugar.</h1><p className="mt-5">Ambiente ainda não conectado ao Supabase. Configure as variáveis de .env.example e aplique as migrations para ativar autenticação e dados reais.</p><p className="mt-5 rounded-xl bg-amber-100 p-4">Nenhuma integração Meta ativa. Dados simulados serão identificados explicitamente.</p><nav className="mt-6 flex flex-wrap gap-5" aria-label="Começar"><Link href="/demo">Explorar demonstração simulada</Link><Link href="/onboarding?mode=demo">Configurar empresa simulada</Link><Link href="/login">Entrar</Link></nav></main>;
  const {organizationId,role}=await requireTenant();
  return <main className="mx-auto max-w-5xl p-8"><p className="font-bold text-indigo-700">SHEEP CRM</p><h1 className="mt-5 text-3xl font-bold">Central de atendimento</h1><p className="mt-4">Empresa: {organizationId} · Perfil: {role}</p><nav className="my-6 flex flex-wrap gap-5" aria-label="Workspace"><Link href="/inbox">Conversas</Link><Link href="/crm">Funil comercial</Link><Link href="/dashboard">Dashboard</Link><Link href="/onboarding">Configuração e aprovação</Link><Link href="/usage">Uso e franquia</Link></nav><form action="/auth/signout" method="post"><button className="mt-6 rounded-lg bg-indigo-700 px-4 py-2 text-white">Sair</button></form></main>;
}
