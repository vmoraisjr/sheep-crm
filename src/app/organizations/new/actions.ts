'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
export async function createOrganization(form:FormData) {
  const name=z.string().trim().min(2).max(120).safeParse(form.get('name'));
  if(!name.success) redirect('/organizations/new?error=invalid');
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login');
  const {error}=await supabase.rpc('create_organization',{organization_name:name.data});
  if(error) redirect('/organizations/new?error=create');
  redirect('/');
}
