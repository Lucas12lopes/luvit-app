const placeholder = value => !value || value.startsWith("COLOQUE_");
export const isSupabaseConfigured = () => {
  const config = window.LUVIT_CONFIG || {};
  return !placeholder(config.supabaseUrl) && !placeholder(config.supabaseAnonKey) && Boolean(window.supabase?.createClient);
};
let client;
export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) client = window.supabase.createClient(window.LUVIT_CONFIG.supabaseUrl, window.LUVIT_CONFIG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
export async function getSession() { const supabase = getSupabase(); if (!supabase) return null; const { data, error } = await supabase.auth.getSession(); if (error) throw error; return data.session; }
export async function requireAuth() {
  if (!isSupabaseConfigured()) return { localMode: true, user: { id: "local-user", email: "modo@local", user_metadata: { name: "Visitante" } } };
  const session = await getSession(); if (!session) { const next = encodeURIComponent(`${location.pathname}${location.search}`); location.replace(`/login.html?next=${next}`); return null; }
  return { localMode: false, user: session.user };
}
