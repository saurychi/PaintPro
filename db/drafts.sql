-- Drafts table. Holds the basic-details wizard state while the admin is
-- still working on a new project but hasn't yet clicked Save and Continue.
-- Lets the "Message Employee" / measure-generator flow attach to something
-- real (the draft) without polluting the projects table.
create table if not exists public.drafts (
  draft_id uuid primary key default gen_random_uuid(),
  draft_code text not null unique,
  project_name text,
  description text,
  site_address text,
  scheduled_start_datetime timestamptz,
  scheduled_end_datetime timestamptz,
  dimensions jsonb not null default jsonb_build_object('scaled', '{}'::jsonb, 'notes', ''),
  client_id uuid references public.clients(client_id) on delete set null,
  client_full_name text,
  client_email text,
  client_phone text,
  client_address text,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drafts_created_by_idx on public.drafts(created_by);
create index if not exists drafts_code_idx on public.drafts(draft_code);

-- Conversations can now attach to either a project or a draft. Existing
-- rows keep project_id; new draft-linked rows fill draft_id. When the
-- draft is upgraded to a project (Save and Continue), code migrates each
-- conversation from draft_id to project_id and clears draft_id.
alter table public.conversations
  add column if not exists draft_id uuid references public.drafts(draft_id) on delete set null;

create index if not exists conversations_draft_id_idx on public.conversations(draft_id);
