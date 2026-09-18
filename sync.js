// Optionaler Sync über Supabase. Wird nur geladen/aktiv, wenn config.js ausgefüllt ist.
let sb = null;
let user = null;
let pending = {};
let timer = null;

export async function init(cfg, onAuth) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;
  sb.auth.onAuthStateChange((_e, session) => { user = session?.user || null; onAuth(user); });
  return user;
}

export async function signIn(email, redirectTo) {
  if (!sb) return "Sync ist nicht eingerichtet";
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  return error ? error.message : null;
}

export async function signOut() { if (sb) await sb.auth.signOut(); user = null; }

// Fortschritt gebündelt hochladen (2 s nach der letzten Bewertung)
export function queueProgress(cardId, data) {
  if (!sb || !user) return;
  pending[cardId] = data;
  clearTimeout(timer);
  timer = setTimeout(flush, 2000);
}
async function flush() {
  const batch = pending; pending = {};
  await pushProgress(batch);
}
window.addEventListener("pagehide", () => { if (Object.keys(pending).length) flush(); });

export async function pushProgress(map) {
  if (!sb || !user) return;
  const rows = Object.entries(map).map(([card_id, data]) => ({
    user_id: user.id, card_id, data, updated_at: new Date(data.upd || Date.now()).toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("progress").upsert(rows.slice(i, i + 500));
    if (error) { console.warn("Sync progress", error); Object.assign(pending, map); return; }
  }
}

export async function saveOwnCard(c) {
  if (!sb || !user) return;
  const { error } = await sb.from("cards").upsert({
    id: c.id, owner: user.id, deck_id: c.deckId, topic: c.topic, q: c.q, a: c.a,
    exam: !!c.exam, shared: !!c.shared, deleted: !!c.deleted,
    updated_at: new Date(c.upd || Date.now()).toISOString(),
  });
  if (error) console.warn("Sync card", error);
}

export async function deleteOwnCard(id) {
  if (!sb || !user) return;
  const { error } = await sb.from("cards").update({ deleted: true, updated_at: new Date().toISOString() }).eq("id", id).eq("owner", user.id);
  if (error) console.warn("Sync delete", error);
}

async function selectAll(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

export async function pullAll() {
  if (!sb || !user) return null;
  try {
    const prog = await selectAll(() => sb.from("progress").select("card_id,data").eq("user_id", user.id));
    const cards = await selectAll(() => sb.from("cards").select("*"));
    const progress = {};
    for (const r of prog) progress[r.card_id] = r.data;
    const map = (r) => ({ id: r.id, deckId: r.deck_id, topic: r.topic, q: r.q, a: r.a, exam: r.exam, shared: r.shared, deleted: r.deleted, upd: Date.parse(r.updated_at) });
    const own = cards.filter((r) => r.owner === user.id).map(map);
    const shared = cards.filter((r) => r.owner !== user.id && r.shared && !r.deleted).map(map);
    const decks = [];
    for (const c of [...own, ...shared]) {
      const m = /^s(\d+)-(.+)$/.exec(c.deckId);
      if (m && !decks.some((d) => d.id === c.deckId)) decks.push({ id: c.deckId, semester: Number(m[1]), fach: m[2].replace(/-/g, " ").replace(/\b\w/g, (x) => x.toUpperCase()), kurz: m[2].split("-")[0] });
    }
    return { progress, own, shared, decks };
  } catch (e) { console.warn("Sync pull", e); return null; }
}
