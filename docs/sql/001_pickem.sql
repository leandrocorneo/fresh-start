-- Pick'em PGL Major Singapore 2026
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------ tabelas
create table if not exists public.stages (
  id            text primary key,
  name          text not null,
  sort          int  not null,
  hltv_event_id int,
  teams         jsonb not null default '[]'::jsonb,   -- [{name, logo}]
  matches       jsonb not null default '[]'::jsonb,   -- [{team1, team2, score1, score2, date}] em ordem cronológica
  source        text not null default 'hltv' check (source in ('hltv','manual')),
  lock_at       timestamptz,                          -- palpites fecham aqui (null = aberto)
  last_sync     timestamptz,
  sync_error    text
);

-- IDs da HLTV: Stage 1 = 9303; Stage 3 e Playoffs ficam no evento principal 8302.
-- Stage 2 é descoberto automaticamente pelo sync (ou preencha no /#admin).
-- Horários de fechamento: confira e ajuste no /#admin.
-- Stage 1 vem ABERTO para o grupo registrar os palpites que já fizeram; feche depois.
insert into public.stages (id, name, sort, hltv_event_id, lock_at) values
  ('stage1',   'Stage 1',  1, 9303, null),
  ('stage2',   'Stage 2',  2, null, '2026-11-28 04:00:00+00'),
  ('stage3',   'Stage 3',  3, 8302, '2026-12-02 04:00:00+00'),
  ('playoffs', 'Playoffs', 4, 8302, '2026-12-10 04:00:00+00')
on conflict (id) do nothing;

create table if not exists public.players (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
create unique index if not exists players_name_unique on public.players (lower(name));

create table if not exists public.picks (
  player_id  uuid not null references public.players(id) on delete cascade,
  stage_id   text not null references public.stages(id),
  picks      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, stage_id)
);

-- ------------------------------------------------------------------ segurança
alter table public.stages  enable row level security;
alter table public.players enable row level security;
alter table public.picks   enable row level security;

drop policy if exists "stages public read" on public.stages;
create policy "stages public read" on public.stages for select using (true);

drop policy if exists "players public read" on public.players;
create policy "players public read" on public.players for select using (true);
-- o hash do token nunca sai do banco
revoke select on public.players from anon, authenticated;
grant select (id, name, created_at) on public.players to anon, authenticated;

-- palpites dos outros só ficam visíveis depois que a fase fecha
drop policy if exists "picks visible after lock" on public.picks;
create policy "picks visible after lock" on public.picks for select using (
  exists (select 1 from public.stages s
          where s.id = picks.stage_id and s.lock_at is not null and now() >= s.lock_at)
);
-- escrita só via funções abaixo (security definer) ou edge functions (service role)

-- ------------------------------------------------------------------ funções
create or replace function public.pickem_hash(p text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;

create or replace function public.register_player(p_name text, p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id   uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if length(v_name) < 2 or length(v_name) > 24 then
    raise exception 'O nome precisa ter entre 2 e 24 caracteres';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'Token inválido';
  end if;
  select id into v_id from players where token_hash = pickem_hash(p_token);
  if exists (select 1 from players where lower(name) = lower(v_name) and (v_id is null or id <> v_id)) then
    raise exception 'Esse nome já está em uso';
  end if;
  if v_id is null then
    insert into players (name, token_hash) values (v_name, pickem_hash(p_token)) returning id into v_id;
  else
    update players set name = v_name where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.save_picks(p_token text, p_stage text, p_picks jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id   uuid;
  v_lock timestamptz;
begin
  select id into v_id from players where token_hash = pickem_hash(p_token);
  if v_id is null then raise exception 'Jogador não encontrado'; end if;

  select lock_at into v_lock from stages where id = p_stage;
  if not found then raise exception 'Fase inválida'; end if;
  if v_lock is not null and now() >= v_lock then
    raise exception 'Os palpites desta fase já fecharam';
  end if;

  if p_stage = 'playoffs' then
    if jsonb_array_length(coalesce(p_picks->'qf', '[]')) <> 4
       or jsonb_array_length(coalesce(p_picks->'sf', '[]')) <> 2
       or jsonb_array_length(coalesce(p_picks->'final', '[]')) <> 1 then
      raise exception 'Palpite de playoffs incompleto';
    end if;
  else
    if jsonb_array_length(coalesce(p_picks->'three_zero', '[]')) <> 2
       or jsonb_array_length(coalesce(p_picks->'advance', '[]')) <> 6
       or jsonb_array_length(coalesce(p_picks->'zero_three', '[]')) <> 2 then
      raise exception 'O palpite precisa de 2 times 3-0, 6 times 3-1/3-2 e 2 times 0-3';
    end if;
  end if;

  insert into picks (player_id, stage_id, picks, updated_at)
  values (v_id, p_stage, p_picks, now())
  on conflict (player_id, stage_id) do update set picks = excluded.picks, updated_at = now();
end $$;

create or replace function public.get_my_picks(p_token text)
returns table (stage_id text, picks jsonb, updated_at timestamptz)
language sql security definer set search_path = public, extensions as $$
  select pk.stage_id, pk.picks, pk.updated_at
  from picks pk join players pl on pl.id = pk.player_id
  where pl.token_hash = pickem_hash(p_token)
$$;

-- quem já enviou palpite (sem revelar o palpite)
create or replace function public.submitted_players()
returns table (player_id uuid, stage_id text)
language sql security definer set search_path = public as $$
  select player_id, stage_id from picks
$$;

grant execute on function public.register_player(text, text) to anon, authenticated;
grant execute on function public.save_picks(text, text, jsonb) to anon, authenticated;
grant execute on function public.get_my_picks(text) to anon, authenticated;
grant execute on function public.submitted_players() to anon, authenticated;
