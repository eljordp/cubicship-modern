-- Cubic Ship customer profile + ticket database
-- Run this in Supabase SQL Editor before enabling the Supabase customer store.
-- The anon key is public; security comes from Auth + RLS policies below.

create extension if not exists pgcrypto;

create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  phone text default '',
  company text default '',
  account_type text not null default 'personal' check (account_type in ('personal', 'business')),
  business_profile jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.customer_shipments (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  status text not null default 'submitted' check (status in ('submitted', 'ready_for_dropoff', 'dropped_off', 'completed', 'issue')),
  customer_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null,
  customer_email text not null,
  customer_phone text default '',
  location_id text not null default 'bridgeview',
  location_name text not null default 'Cubic Ship Bridgeview',
  location_email text default '',
  service_type text default 'DHL Express',
  recipient_name text not null,
  destination_country text not null,
  destination_city text default '',
  destination_postal text default '',
  pieces text default '1',
  weight text default '',
  dimensions text default '',
  contents text not null,
  declared_value text default '',
  notes text default '',
  estimate jsonb not null default '{"status":"pending_rates","label":"Estimated price pending","amount":"","currency":"USD","message":"Cubic Ship will calculate the estimated price once rates are connected."}'::jsonb,
  label_reference text default '',
  carrier_tracking text default '',
  tracking_ready_notified_at timestamptz,
  tracking_ready_notification_status text default '',
  tracking_ready_notification_error text default '',
  location_notified_at timestamptz,
  location_notification_status text default '',
  location_notification_error text default '',
  staff_notes text default '',
  verified_at timestamptz,
  verified_by text default '',
  updated_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_shipments_customer_id_idx on public.customer_shipments(customer_id);
create index if not exists customer_shipments_location_id_idx on public.customer_shipments(location_id);
create index if not exists customer_shipments_created_at_idx on public.customer_shipments(created_at desc);

alter table public.customer_profiles enable row level security;
alter table public.customer_shipments enable row level security;

drop policy if exists "Customers can read own profile" on public.customer_profiles;
create policy "Customers can read own profile"
on public.customer_profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Customers can update own profile basics" on public.customer_profiles;
create policy "Customers can update own profile basics"
on public.customer_profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Customers can read own shipments" on public.customer_shipments;
create policy "Customers can read own shipments"
on public.customer_shipments for select
to authenticated
using ((select auth.uid()) = customer_id);

drop policy if exists "Customers can create own shipment tickets" on public.customer_shipments;
create policy "Customers can create own shipment tickets"
on public.customer_shipments for insert
to authenticated
with check ((select auth.uid()) = customer_id);

-- Staff access is handled by Vercel API routes using the Supabase service role.
-- Do not expose the service role key in browser code, source files, chats, screenshots, or client logs.
