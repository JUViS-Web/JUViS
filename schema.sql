-- JUVIS Supabase schema. Run in Supabase SQL Editor.
-- Review roles and policies with an adult/administrator before using real data.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('admin','leader','member')),
  created_at timestamptz not null default now()
);
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  location text,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  planned_date date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.clothing (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  item text not null,
  size text,
  locker_number text,
  qr_code text unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text,
  description text,
  storage_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Role lookup helper; security definer prevents recursive profile-policy checks.
create or replace function public.current_juvis_role()
returns text language sql stable security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.exercises enable row level security;
alter table public.clothing enable row level security;
alter table public.documents enable row level security;

-- Users can read their own profile; admins can read all profiles.
drop policy if exists "profile read own or admin" on public.profiles;
create policy "profile read own or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.current_juvis_role() = 'admin');
-- New users get member role through this trigger; users cannot self-assign admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles(id, display_name, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name',''), 'member')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

drop policy if exists "profile update own display only" on public.profiles;
create policy "profile update own display only" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid() and role = public.current_juvis_role());

-- Members may read member directory and public schedule/docs; only leader/admin writes.
do $$ declare t text; begin
 foreach t in array array['members','events','exercises','clothing','documents'] loop
  execute format('drop policy if exists %I on public.%I','read authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using (true)','read authenticated',t);
  execute format('drop policy if exists %I on public.%I','staff insert',t);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.current_juvis_role() in (''admin'',''leader''))','staff insert',t);
  execute format('drop policy if exists %I on public.%I','staff update',t);
  execute format('create policy %I on public.%I for update to authenticated using (public.current_juvis_role() in (''admin'',''leader'')) with check (public.current_juvis_role() in (''admin'',''leader''))','staff update',t);
  execute format('drop policy if exists %I on public.%I','staff delete',t);
  execute format('create policy %I on public.%I for delete to authenticated using (public.current_juvis_role() in (''admin'',''leader''))','staff delete',t);
 end loop;
end $$;

-- IMPORTANT:
-- 1) After your first trusted adult account signs up, assign admin role from SQL Editor:
--    update public.profiles set role='admin' where id=(select id from auth.users where email='YOUR-ADMIN-EMAIL');
-- 2) Keep the service_role key secret; never place it in config.js.
-- 3) These policies expose the member directory to signed-in users. Review whether members
--    should see all records before real deployment. Configure email verification and backups.
-- 4) For documents, create a private Storage bucket and explicit Storage RLS policies before uploads.
