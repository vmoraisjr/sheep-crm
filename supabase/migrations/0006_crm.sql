-- One opportunity per eligible contact, enforced by the existing tenant/contact unique key.
create function public.ensure_contact_opportunity() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if not new.opted_out then
 insert into public.opportunities(organization_id,contact_id) values(new.organization_id,new.id)
 on conflict(organization_id,contact_id) do nothing;
 end if;
 return new;
end $$;
create trigger contact_opportunity after insert on public.contacts for each row execute function public.ensure_contact_opportunity();
insert into public.opportunities(organization_id,contact_id)
select organization_id,id from public.contacts where not opted_out on conflict(organization_id,contact_id) do nothing;
create function public.update_crm_opportunity(p_organization_id uuid,p_id uuid,p_patch jsonb) returns void language plpgsql security invoker set search_path=public as $$
declare ct uuid;
begin
 if not public.is_org_member(p_organization_id) then raise exception 'Tenant access denied'; end if;
 select contact_id into strict ct from public.opportunities where organization_id=p_organization_id and id=p_id for update;
 update public.opportunities set
 stage=case when p_patch ? 'stage' then p_patch->>'stage' else stage end,
 assignee=case when p_patch ? 'assignee' then auth.uid() else assignee end,
 next_action=case when p_patch ? 'nextAction' then p_patch->>'nextAction' else next_action end,
 value_cents=case when p_patch ? 'valueCents' then (p_patch->>'valueCents')::bigint else value_cents end
 where organization_id=p_organization_id and id=p_id;
 if p_patch ? 'tags' then update public.contacts set tags=array(select jsonb_array_elements_text(p_patch->'tags')) where organization_id=p_organization_id and id=ct; end if;
end $$;
revoke all on function public.update_crm_opportunity(uuid,uuid,jsonb) from public,anon;
grant execute on function public.update_crm_opportunity(uuid,uuid,jsonb) to authenticated;
