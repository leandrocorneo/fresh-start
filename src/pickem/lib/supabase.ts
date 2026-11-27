import { createClient } from '@supabase/supabase-js';

// No Lovable Cloud essas variáveis já existem no .env do projeto.
const url = import.meta.env['VITE_SUPABASE_URL'] as string;
const key = (import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ?? import.meta.env['VITE_SUPABASE_ANON_KEY']) as string;

if (!url || !key) console.error('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env');

// As chaves novas (sb_publishable_...) não são JWT: vão só no header apikey, nunca como Bearer.
const isNewKey = key?.startsWith('sb_publishable_') ?? false;
const fetchWithKey: typeof fetch = (input, init) => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
  if (isNewKey && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
  headers.set('apikey', key);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fetchWithKey },
});
