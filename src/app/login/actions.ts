'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
const credentials=z.object({email:z.email(),password:z.string().min(12).max(200)});
export async function signIn(form:FormData) {
  const parsed=credentials.safeParse({email:form.get('email'),password:form.get('password')});
  if(!parsed.success) redirect('/login?error=invalid');
  const supabase=await createClient();
  const {error}=await supabase.auth.signInWithPassword(parsed.data);
  if(error) redirect('/login?error=auth');
  redirect('/');
}
export async function signUp(form:FormData) {
  const parsed=credentials.safeParse({email:form.get('email'),password:form.get('password')});
  if(!parsed.success) redirect('/login?error=invalid');
  const supabase=await createClient();
  const {error}=await supabase.auth.signUp(parsed.data);
  if(error) redirect('/login?error=auth');
  redirect('/login?message=confirm');
}
