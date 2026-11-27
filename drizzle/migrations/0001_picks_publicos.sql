-- Palpites visíveis para todo mundo a qualquer momento (antes só apareciam depois que a fase fechava).
-- O token de cada jogador continua protegido: a edição dos palpites ainda passa por save_picks().
drop policy if exists "picks visible after lock" on public.picks;
drop policy if exists "picks public read" on public.picks;
create policy "picks public read" on public.picks for select using (true);
