-- Lernkarten: Tabellen + Zugriffsregeln (Row Level Security)
-- In Supabase: SQL Editor → New query → einfügen → Run

create table if not exists public.progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  card_id    text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table if not exists public.cards (
  id         text primary key,
  owner      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  deck_id    text not null,
  topic      text not null default 'Eigene',
  q          text not null,
  a          text not null,
  exam       boolean not null default false,
  shared     boolean not null default false,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;
alter table public.cards    enable row level security;

-- Fortschritt: jede:r sieht und ändert nur den eigenen
drop policy if exists "progress_own" on public.progress;
create policy "progress_own" on public.progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Karten: eigene + von anderen geteilte lesen, nur eigene schreiben
drop policy if exists "cards_read" on public.cards;
create policy "cards_read" on public.cards
  for select using (auth.uid() = owner or (shared and not deleted and auth.uid() is not null));
drop policy if exists "cards_insert" on public.cards;
create policy "cards_insert" on public.cards
  for insert with check (auth.uid() = owner);
drop policy if exists "cards_update" on public.cards;
create policy "cards_update" on public.cards
  for update using (auth.uid() = owner) with check (auth.uid() = owner);
drop policy if exists "cards_delete" on public.cards;
create policy "cards_delete" on public.cards
  for delete using (auth.uid() = owner);

-- Kleine öffentliche Tabelle für den Wach-halten-Ping (GitHub Action)
create table if not exists public.ping (id int primary key, at timestamptz default now());
insert into public.ping (id) values (1) on conflict do nothing;
alter table public.ping enable row level security;
drop policy if exists "ping_read" on public.ping;
create policy "ping_read" on public.ping for select using (true);
