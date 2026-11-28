-- Login só pelo nome: digitar um nome que já existe entra na conta dele, em qualquer navegador.
-- Não há mais token por navegador. Qualquer pessoa pode entrar na conta de outra (decisão do projeto).

-- jogadores novos não têm mais token
alter table public.players alter column token_hash drop not null;

-- entra na conta pelo nome (sem diferenciar maiúsculas) ou cria uma nova
create or replace function public.login_player(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if length(v_name) < 2 or length(v_name) > 24 then
    raise exception 'O nome precisa ter entre 2 e 24 caracteres';
  end if;
  select id into v_id from players where lower(name) = lower(v_name);
  if v_id is null then
    insert into players (name) values (v_name)
    on conflict ((lower(name))) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from players where lower(name) = lower(v_name);
    end if;
  end if;
  return v_id;
end $$;

-- salva o palpite de um jogador pelo id (as regras de fechamento e de formato continuam)
create or replace function public.save_player_picks(p_player uuid, p_stage text, p_picks jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lock timestamptz;
begin
  if not exists (select 1 from players where id = p_player) then
    raise exception 'Jogador não encontrado';
  end if;

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
  values (p_player, p_stage, p_picks, now())
  on conflict (player_id, stage_id) do update set picks = excluded.picks, updated_at = now();
end $$;

grant execute on function public.login_player(text) to anon, authenticated;
grant execute on function public.save_player_picks(uuid, text, jsonb) to anon, authenticated;

-- funções antigas, presas ao token do navegador
drop function if exists public.register_player(text, text);
drop function if exists public.save_picks(text, text, jsonb);
drop function if exists public.get_my_picks(text);
