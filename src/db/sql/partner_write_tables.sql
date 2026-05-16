-- Run in Supabase SQL editor before using insert_partner_note,
-- upsert_partner_placement, or insert_partner_test_result tools.

create table if not exists public.partner_notes (
  id uuid primary key default gen_random_uuid(),
  partner_key text not null references public.partners(key),
  note_type text not null default 'general',
  note text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_placements (
  id uuid primary key default gen_random_uuid(),
  partner_key text not null references public.partners(key),
  placement_type text not null,
  label text,
  is_active boolean not null default true,
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_key, placement_type)
);

create table if not exists public.partner_test_results (
  id uuid primary key default gen_random_uuid(),
  partner_key text not null references public.partners(key),
  experiment_name text not null,
  ctr numeric,
  clicks integer,
  conversions integer,
  notes text,
  tested_at date not null default current_date,
  created_at timestamptz not null default now()
);
