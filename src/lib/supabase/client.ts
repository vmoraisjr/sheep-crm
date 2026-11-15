'use client';
import { createBrowserClient } from '@supabase/ssr';
import { supabaseConfig } from './config';
export function createClient(remember?:boolean) { const {url,key}=supabaseConfig(); if(remember!==undefined)document.cookie=`a2-remember=${remember?'1':'0'}; Path=/; SameSite=Lax${remember?'; Max-Age=31536000':''}`;const persistent=remember??!document.cookie.split('; ').includes('a2-remember=0');return createBrowserClient(url,key,{isSingleton:false,cookieOptions:{maxAge:persistent?31536000:undefined}}); }
