-- Run once in Supabase Dashboard -> SQL Editor.

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  linkedin_url text not null,
  instagram_url text not null,
  ig_username text,
  headline text,
  location text,
  photo_url text,
  is_seed boolean not null default true,
  status text not null default 'new', -- new|scraping|scraped|analyzing|ready|dating|ranked|failed
  error text,
  created_at timestamptz not null default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people on delete cascade,
  kind text not null check (kind in ('linkedin', 'instagram')),
  apify_actor text,
  apify_run_id text,
  status text not null default 'pending', -- pending|running|done|failed
  error text,
  raw jsonb,
  images jsonb, -- [{ postId, url, caption }]
  created_at timestamptz not null default now(),
  unique (person_id, kind)
);

create table if not exists profiles (
  person_id uuid primary key references people on delete cascade,
  data jsonb not null,
  photo_notes jsonb,
  model text,
  created_at timestamptz not null default now()
);

create table if not exists dates (
  id uuid primary key default gen_random_uuid(),
  a_id uuid not null references people on delete cascade,
  b_id uuid not null references people on delete cascade,
  round int not null default 1,
  status text not null default 'pending', -- pending|live|done|failed
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (a_id, b_id, round)
);

create table if not exists date_messages (
  id bigserial primary key,
  date_id uuid not null references dates on delete cascade,
  speaker_id uuid not null references people on delete cascade,
  turn int not null,
  phase text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists date_messages_date_idx on date_messages (date_id, turn);

create table if not exists verdicts (
  date_id uuid not null references dates on delete cascade,
  judge_id uuid not null references people on delete cascade,
  about_id uuid not null references people on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (date_id, judge_id)
);

create table if not exists rankings (
  person_id uuid not null references people on delete cascade,
  candidate_id uuid not null references people on delete cascade,
  rank int not null,
  score numeric not null,
  my_view numeric,
  their_view numeric,
  mutual boolean not null default false,
  reasons jsonb,
  date_id uuid references dates on delete set null,
  primary key (person_id, candidate_id)
);

-- RLS on with no policies: only the server (service role) can read/write.
alter table people enable row level security;
alter table sources enable row level security;
alter table profiles enable row level security;
alter table dates enable row level security;
alter table date_messages enable row level security;
alter table verdicts enable row level security;
alter table rankings enable row level security;

insert into storage.buckets (id, name, public)
values ('ig-images', 'ig-images', true)
on conflict (id) do nothing;
