# Pick'em · PGL Major Singapore 2026

Simulador das 3 fases Swiss + playoffs, no estilo do majors.im, com palpites salvos por pessoa e uma tabela da galera
que marca em vermelho cada palpite que já errou, conferindo com os resultados da HLTV.

## Como funciona

- **Identificação:** ao abrir o site a pessoa digita o nome. Se o nome já existe (sem diferenciar maiúsculas), ela entra
  nessa conta, em qualquer navegador ou aparelho; se não, uma conta nova é criada. Não há senha: qualquer um pode entrar na
  conta de outro digitando o nome dele (`docs/sql/004_login_por_nome.sql`).
- **Simulador:** a rodada 1 é seed 1 x 9, 2 x 10 etc. Nas seguintes, os times com a mesma campanha se enfrentam, o melhor
  colocado (Buchholz, depois seed) contra o pior, sem repetir confronto. É uma aproximação do pareamento da Valve. Jogos que já
  aconteceram entram travados com o selo **HLTV**. Quando a simulação termina, "Usar esta simulação" preenche o Pick'em
  sozinho (2× 3-0, 6× 3-1/3-2, 2× 0-3). Também dá para montar o Pick'em clicando time a time.
- **Fases seguintes:** a Stage 2 usa os 8 convidados + os 8 classificados da Stage 1 (os reais, se a fase já acabou, senão
  os da sua simulação). O mesmo vale para a Stage 3 e para a chave dos playoffs.
- **Regras (Pick'em do CS2):** 3:0 só acerta se o time terminar 3-0 (uma derrota já é erro). 3:1/3:2 só acerta se o time
  classificar com 3-1 ou 3-2 (se ele for 3-0 ou for eliminado, é erro). 0:3 só acerta se terminar 0-3. São precisos 5 acertos
  para "passar" na fase. Nos playoffs, você escolhe o vencedor de cada jogo, e a disputa de 3º lugar não conta.
- **Palpites abertos:** os palpites de todo mundo ficam visíveis o tempo todo, mesmo antes da fase fechar
  (`docs/sql/003_picks_publicos.sql` + `HIDE_PICKS_UNTIL_LOCK = false`). O fechamento só trava a edição.
- **HLTV:** a edge function `sync-hltv` lê `hltv.org/events/<id>` (times e logos) e `hltv.org/results?event=<id>`
  (placares). A página pede um sync quando o último tem mais de 10 minutos, e dá para agendar a cada 10 min com o pg_cron.

IDs dos eventos na HLTV: Stage 1 = **9303**, Stage 3 + Playoffs = **8302** (as partidas a partir de 08/12 contam como
playoffs). O ID da Stage 2 é descoberto automaticamente; se não for, preencha no admin.

## Configurar no Lovable

O app roda dentro do template TanStack Start do Lovable: o código fica em `src/pickem/` e a página é `src/routes/index.tsx`
(o admin abre em `/#admin`).

1. No chat do Lovable, peça: *"aplique como migração do banco o SQL de docs/sql/001_pickem.sql"*. O SQL fica em `docs/`
   porque quem cria as migrações em `supabase/migrations/` é o próprio Lovable.
2. Crie o secret **`ADMIN_PIN`** (Cloud → Secrets) com a senha do admin.
3. As edge functions `sync-hltv` e `admin` (em `supabase/functions/`) são publicadas pelo Lovable. Elas ficam com
   `verify_jwt = false` no `supabase/config.toml`, porque a chave `sb_publishable_` não é um JWT.
4. Publique, abra `https://seu-site/#admin`, entre com o PIN e confira os horários de fechamento de cada fase.
5. (Opcional) Para sincronizar a cada 10 min mesmo com o site fechado, peça ao Lovable para rodar
   `docs/sql/002_cron_opcional.sql`, trocando `<PROJECT_REF>` e `<ANON_KEY>`.

### Stage 1 já começou

A Stage 1 vem **aberta** (sem horário de fechamento) para o grupo registrar os palpites que já tinha feito. Quando todo
mundo terminar, defina o fechamento no `/#admin` (qualquer data no passado). A partir daí os palpites ficam visíveis e
corrigidos na tabela.

### Se a HLTV bloquear

A HLTV fica atrás do Cloudflare e às vezes recusa acessos vindos de servidores (o erro "403" ou "Bloqueado pelo Cloudflare"
aparece no card "Resultado real" e no admin). Há duas saídas:

- **Proxy de scraping:** crie o secret `SCRAPE_PROXY` com a URL de um serviço como ScraperAPI ou ZenRows, usando `{url}` no
  lugar do endereço. Exemplo: `https://api.scraperapi.com/?api_key=SUA_CHAVE&url={url}`.
- **Manual:** no admin, mude a fase para "Manual" e cole as partidas em JSON
  (`[{"team1":"FURIA","team2":"MOUZ","score1":2,"score2":1}]`, em ordem cronológica). A correção dos palpites funciona igual.

## Ajustes rápidos

- `src/pickem/lib/config.ts`: seeds de cada fase, apelidos de times (PVISION = PARIVISION, GOSH = BC.Game...), intervalo de
  atualização e `HIDE_PICKS_UNTIL_LOCK`.
- Testes da lógica (Swiss, regras e chave): `npm test` (`src/test/pickem-logic.test.ts`).

## Rodar local

```bash
npm install
npm run dev
```
