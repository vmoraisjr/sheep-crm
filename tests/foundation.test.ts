import { describe,it,expect } from 'vitest';
import {canManageOrganization,isRole} from '../src/lib/auth/roles';
import {supabaseConfig} from '../src/lib/supabase/config';
describe('authorization boundary',()=>{
 it('only owner and admin can manage organizations',()=>{expect(canManageOrganization('owner')).toBe(true);expect(canManageOrganization('admin')).toBe(true);expect(canManageOrganization('member')).toBe(false);});
 it('rejects unrecognized roles',()=>{expect(isRole('service_role')).toBe(false);expect(isRole(null)).toBe(false);expect(isRole('member')).toBe(true);});
 it('fails closed without Supabase configuration',()=>{const previous=process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_URL;expect(()=>supabaseConfig()).toThrow('Supabase');if(previous)process.env.NEXT_PUBLIC_SUPABASE_URL=previous;});
});
