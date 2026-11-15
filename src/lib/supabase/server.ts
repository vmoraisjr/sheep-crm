import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from './config';
export async function createClient() {
  const store = await cookies(); const {url,key} = supabaseConfig();
  return createServerClient(url,key,{cookieOptions:{maxAge:store.get('a2-remember')?.value==='0'?undefined:31536000},cookies:{getAll:()=>store.getAll(),setAll(values){try {values.forEach(({name,value,options})=>store.set(name,value,options));} catch { /* Server Components cannot set cookies; proxy refreshes session. */ }}}});
}
