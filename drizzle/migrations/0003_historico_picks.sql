-- Histórico de alterações dos palpites (anti-trolagem).
-- Toda gravação na tabela picks (pelo site, por chamada direta à API ou pelo admin) gera uma linha
-- aqui, com IP e navegador de quem salvou. Só o admin vê (pela edge function admin, com o PIN):
-- a tabela não tem nenhuma policy de leitura para o público.

create table if not exists public.pick_history (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.players(id) on delete cascade,
  stage_id    text not null references public.stages(id),
  picks       jsonb not null,
  source      text not null default 'site',  -- site | admin_restore | inicial
  ip          text,
  user_agent  text,
  headers     jsonb,                         -- cabeçalhos de origem, para conferência
  location    text,                          -- preenchido pelo admin (consulta de IP)
  created_at  timestamptz not null default now()
);
create index if not exists pick_history_lookup on public.pick_history (player_id, stage_id, created_at desc);
create index if not exists pick_history_created on public.pick_history (created_at desc);

alter table public.pick_history enable row level security;
revoke all on public.pick_history from anon, authenticated;

-- grava uma versão a cada inserção/alteração de palpite
create or replace function public.pickem_log_pick() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  h    json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  v_ip text;
begin
  if tg_op = 'UPDATE' and new.picks is not distinct from old.picks then
    return new;
  end if;
  -- primeiro IP da cadeia x-forwarded-for é o do navegador; os outros são proxies
  v_ip := nullif(btrim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), '');
  v_ip := coalesce(v_ip, h->>'cf-connecting-ip', h->>'x-real-ip');
  insert into pick_history (player_id, stage_id, picks, source, ip, user_agent, headers)
  values (
    new.player_id, new.stage_id, new.picks,
    coalesce(nullif(current_setting('pickem.source', true), ''), 'site'),
    v_ip,
    h->>'user-agent',
    jsonb_strip_nulls(jsonb_build_object(
      'x-forwarded-for',  h->>'x-forwarded-for',
      'cf-connecting-ip', h->>'cf-connecting-ip',
      'x-real-ip',        h->>'x-real-ip',
      'cf-ipcountry',     h->>'cf-ipcountry'
    ))
  );
  return new;
end $$;

drop trigger if exists pickem_log_pick on public.picks;
create trigger pickem_log_pick after insert or update on public.picks
  for each row execute function public.pickem_log_pick();

-- os palpites que já existem viram a primeira versão (sem IP: foram salvos antes do histórico)
insert into public.pick_history (player_id, stage_id, picks, source, created_at)
select player_id, stage_id, picks, 'inicial', updated_at
from public.picks
where not exists (select 1 from public.pick_history);

-- restauração pelo admin: grava a versão escolhida, mesmo com a fase já fechada
create or replace function public.admin_restore_pick(p_history_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.pick_history;
begin
  select * into r from public.pick_history where id = p_history_id;
  if not found then
    raise exception 'Versão não encontrada';
  end if;
  perform set_config('pickem.source', 'admin_restore', true);
  insert into public.picks (player_id, stage_id, picks, updated_at)
  values (r.player_id, r.stage_id, r.picks, now())
  on conflict (player_id, stage_id) do update set picks = excluded.picks, updated_at = now();
end $$;

revoke all on function public.admin_restore_pick(bigint) from public, anon, authenticated;
grant execute on function public.admin_restore_pick(bigint) to service_role;
revoke all on function public.pickem_log_pick() from public, anon, authenticated;
