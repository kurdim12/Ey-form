-- Gala Dinner registration schema.
-- This is the exact migration already applied to the live `gala-dinner` project.
-- Run it in the Supabase SQL editor (or via the CLI) when provisioning a new project.

-- Guest registrations
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name  text not null,
  email      text not null,
  phone      text not null,
  photo_url  text,
  status     text not null default 'new' check (status in ('new','checked_in')),
  created_at timestamptz not null default now()
);

alter table public.registrations enable row level security;

-- Public form can only insert
create policy "public_insert" on public.registrations
  for insert to anon
  with check (true);

-- Only the logged-in admin can read/update
create policy "admin_select" on public.registrations
  for select to authenticated
  using (true);

create policy "admin_update" on public.registrations
  for update to authenticated
  using (true) with check (true);

-- Realtime: required, otherwise the dashboard will never receive events
alter publication supabase_realtime add table public.registrations;

-- Photo storage
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "public_upload_photos" on storage.objects
  for insert to anon
  with check (bucket_id = 'photos');

create policy "public_read_photos" on storage.objects
  for select to public
  using (bucket_id = 'photos');
