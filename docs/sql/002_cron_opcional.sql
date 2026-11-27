-- OPCIONAL: sincroniza com a HLTV a cada 10 minutos mesmo sem ninguém com o site aberto.
-- (Sem isso o sync acontece quando alguém abre a página e o último sync tem mais de 10 min.)
-- Troque <PROJECT_REF> e <ANON_KEY> pelos valores do seu projeto antes de rodar.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'pickem-sync-hltv',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-hltv',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
