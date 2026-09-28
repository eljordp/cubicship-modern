-- Additive CRM schema. Access goes through authenticated, branch-scoped server routes.
-- Customer sessions and the anonymous API role have no CRM table access.
begin;
create table if not exists public.crm_contacts (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 name text not null default '', phone text not null default '', postal_code text not null default '',
 language text not null default 'en', marketing_consent boolean not null default false,
 consent_version text, consent_at timestamptz, unsubscribed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.crm_leads (
 id uuid primary key default gen_random_uuid(), source_key text not null unique,
 contact_id uuid not null references public.crm_contacts(id),
 branch_id text not null default '', source text not null, language text not null default 'en',
 title text not null, details text not null default '', stage text not null default 'new'
 check (stage in ('new','contacted','quote_sent','follow_up','won','lost')),
 assigned_to text not null default '', due_at timestamptz, value numeric(12,2),
 attribution jsonb not null default '{}', notifications jsonb not null default '{}',
 source_status text not null default '', version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists crm_leads_branch_created on public.crm_leads(branch_id,created_at desc);
create index if not exists crm_leads_contact on public.crm_leads(contact_id);
create index if not exists crm_leads_due on public.crm_leads(due_at) where stage not in ('won','lost');
create table if not exists public.crm_activities (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.crm_leads(id),
 event_key text unique, kind text not null, actor text not null default 'system',
 body text not null default '', metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists crm_activities_lead on public.crm_activities(lead_id,created_at desc);
create table if not exists public.crm_metrics (
 day date not null default current_date, event text not null, page text not null,
 language text not null, branch_id text not null default '', count bigint not null default 0,
 primary key(day,event,page,language,branch_id)
);
create table if not exists public.crm_rate_limits (
 key text primary key, count integer not null default 0, expires_at timestamptz not null
);
alter table public.crm_contacts enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_metrics enable row level security;
alter table public.crm_rate_limits enable row level security;
revoke all on public.crm_contacts,public.crm_leads,public.crm_activities,public.crm_metrics,public.crm_rate_limits from public,anon,authenticated;
grant all on public.crm_contacts,public.crm_leads,public.crm_activities,public.crm_metrics,public.crm_rate_limits to service_role;

create or replace function public.crm_count(p_event text,p_page text,p_language text,p_branch text default '')
returns void language sql set search_path=public as $$
 insert into crm_metrics(event,page,language,branch_id,count) values(p_event,p_page,p_language,p_branch,1)
 on conflict(day,event,page,language,branch_id) do update set count=crm_metrics.count+1;
$$;
create or replace function public.crm_rate(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql set search_path=public as $$
declare n integer;
begin
 insert into crm_rate_limits(key,count,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set count=case when crm_rate_limits.expires_at<now() then 1 else crm_rate_limits.count+1 end,
 expires_at=case when crm_rate_limits.expires_at<now() then excluded.expires_at else crm_rate_limits.expires_at end
 returning count into n;
 delete from crm_rate_limits where expires_at<now()-interval '1 day';
 return n<=p_limit;
end; $$;

-- A source key makes retries and backfills idempotent. Stage/assignment are never reset by sync.
create or replace function public.crm_ingest(p jsonb) returns jsonb language plpgsql set search_path=public as $$
declare cid uuid; lid uuid; fresh boolean:=false; old_consent boolean;
begin
 insert into crm_contacts(email,name,phone,postal_code,language,updated_at)
 values(lower(p->>'email'),coalesce(p->>'name',''),coalesce(p->>'phone',''),coalesce(p->>'postal_code',''),coalesce(p->>'language','en'),coalesce((p->>'created_at')::timestamptz,now()))
 on conflict(email) do nothing;
 select id,marketing_consent into cid,old_consent from crm_contacts where email=lower(p->>'email') for update;
 insert into crm_leads(source_key,contact_id,branch_id,source,language,title,details,attribution,notifications,source_status,created_at)
 values(p->>'source_key',cid,coalesce(p->>'branch_id',''),p->>'source',coalesce(p->>'language','en'),p->>'title',coalesce(p->>'details',''),
 coalesce(p->'attribution','{}'),coalesce(p->'notifications','{}'),coalesce(p->>'source_status',''),coalesce((p->>'created_at')::timestamptz,now()))
 on conflict(source_key) do nothing returning id into lid;
 fresh:=lid is not null;
 if fresh then
  update crm_contacts set name=case when coalesce(p->>'name','')<>'' and (name='' or coalesce((p->>'created_at')::timestamptz,now())>=updated_at) then p->>'name' else name end,
   phone=case when coalesce(p->>'phone','')<>'' and (phone='' or coalesce((p->>'created_at')::timestamptz,now())>=updated_at) then p->>'phone' else phone end,
   postal_code=case when coalesce(p->>'postal_code','')<>'' and (postal_code='' or coalesce((p->>'created_at')::timestamptz,now())>=updated_at) then p->>'postal_code' else postal_code end,
   updated_at=greatest(updated_at,coalesce((p->>'created_at')::timestamptz,now())) where id=cid;
  insert into crm_activities(lead_id,event_key,kind,body,metadata)
   values(lid,'created:'||(p->>'source_key'),'created','Inquiry saved',jsonb_build_object('source',p->>'source'));
  if p->>'source'='website_callback' then
   insert into crm_activities(lead_id,event_key,kind,body,metadata)
   values(lid,'consent:'||(p->>'source_key'),'consent','Customer requested an email response.',
    jsonb_build_object('purpose','service_follow_up','marketing',coalesce((p->>'marketing')::boolean,false),'version','2026-09-27','language',p->>'language'));
   if coalesce((p->>'marketing')::boolean,false) then
    update crm_contacts set marketing_consent=true,consent_at=now(),consent_version='2026-09-27',unsubscribed_at=null where id=cid;
   end if;
  end if;
  insert into crm_metrics(day,event,page,language,branch_id,count) values(coalesce((p->>'created_at')::timestamptz,now())::date,case when p->>'source'='website_callback' then 'callback_saved' else 'inquiry_saved' end,'server',coalesce(p->>'language','en'),coalesce(p->>'branch_id',''),1)
  on conflict(day,event,page,language,branch_id) do update set count=crm_metrics.count+1;
 else
  select id into lid from crm_leads where source_key=p->>'source_key';
  -- Only the source-system delivery/status fields are refreshed.
  update crm_leads set notifications=coalesce(p->'notifications',notifications),source_status=coalesce(p->>'source_status',source_status)
   where id=lid and source in ('website_shipping','website_service');
 end if;
 return jsonb_build_object('id',lid,'contact_id',cid,'created',fresh);
end; $$;

create or replace function public.crm_update(p_id uuid,p_version integer,p_branch text,p_patch jsonb,p_actor text,p_note text default '')
returns jsonb language plpgsql set search_path=public as $$
declare row crm_leads; before_row crm_leads;
begin
 select * into before_row from crm_leads where id=p_id and (p_branch is null or branch_id=p_branch) for update;
 if not found then raise exception 'not_found'; end if;
 if p_version is null or before_row.version<>p_version then raise exception 'version_conflict'; end if;
 update crm_leads set stage=coalesce(p_patch->>'stage',stage),assigned_to=coalesce(p_patch->>'assigned_to',assigned_to),
 branch_id=coalesce(p_patch->>'branch_id',branch_id),due_at=case when p_patch ? 'due_at' then (p_patch->>'due_at')::timestamptz else due_at end,
 value=case when p_patch ? 'value' then (p_patch->>'value')::numeric else value end,version=version+1,updated_at=now()
 where id=p_id returning * into row;
 insert into crm_activities(lead_id,kind,actor,body,metadata) values(p_id,'workflow',p_actor,coalesce(p_note,''),
 jsonb_build_object('before',jsonb_build_object('stage',before_row.stage,'assigned_to',before_row.assigned_to,'due_at',before_row.due_at,'branch_id',before_row.branch_id,'value',before_row.value),'after',p_patch));
 return to_jsonb(row);
end; $$;
revoke all on function public.crm_count(text,text,text,text),public.crm_rate(text,integer,integer),public.crm_ingest(jsonb),public.crm_update(uuid,integer,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.crm_count(text,text,text,text),public.crm_rate(text,integer,integer),public.crm_ingest(jsonb),public.crm_update(uuid,integer,text,jsonb,text,text) to service_role;
commit;
