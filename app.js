// Lernkarten — statische App, Fortschritt lokal; optional Supabase-Sync (sync.js).
import * as Sync from "./sync.js?v=202609191133";

const DAY = 864e5;
const NEW_PER_SESSION = 20;
const $app = document.getElementById("app");

/* ---------- Speicher (localStorage, abgesichert) ---------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem("lk:" + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("lk:" + key, JSON.stringify(value)); } catch { /* voll/blockiert */ }
  },
};

const state = {
  index: [],          // Fächer aus cards/index.json
  decks: new Map(),   // id -> {id, semester, fach, kurz, cards: []}
  progress: store.get("progress", {}),   // cardId -> {ivl, ease, reps, lapses, due, upd}
  own: store.get("own", []),             // eigene Karten
  customDecks: store.get("customDecks", []),
  remote: [],                            // geteilte Karten anderer (Supabase)
  user: null,
  syncOn: false,
};

const saveProgress = () => store.set("progress", state.progress);
const saveOwn = () => { store.set("own", state.own); store.set("customDecks", state.customDecks); };

/* ---------- Hilfen ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const romans = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- Karten zusammensetzen ---------- */
function allDecks() {
  const list = [...state.index];
  for (const c of state.customDecks) if (!list.some((d) => d.id === c.id)) list.push({ ...c, custom: true });
  return list.sort((a, b) => a.semester - b.semester || a.fach.localeCompare(b.fach, "de"));
}

function cardsOf(deckId) {
  const base = state.decks.get(deckId)?.cards || [];
  const own = state.own.filter((c) => c.deckId === deckId && !c.deleted).map((c) => ({ ...c, own: true }));
  const remote = state.remote.filter((c) => c.deckId === deckId).map((c) => ({ ...c, shared: true }));
  return [...base, ...own, ...remote];
}

function deckById(id) { return allDecks().find((d) => d.id === id); }

/* ---------- Wiederholungsplan (vereinfachtes SM-2) ---------- */
function schedule(prev, rating, now = Date.now()) {
  let { ivl = 0, ease = 2.5, reps = 0, lapses = 0 } = prev || {};
  let due;
  if (rating === 1) {
    if (reps > 0) lapses++;
    reps = 0; ivl = 0; ease = Math.max(1.3, ease - 0.2); due = now + 10 * 60e3;
  } else if (rating === 2 && reps === 0) {
    ivl = 0; ease = Math.max(1.3, ease - 0.15); due = now + 60 * 60e3; // neue Karte, noch unsicher: in 1 Std. wieder
  } else {
    if (rating === 2) { ivl = reps === 0 ? 1 : Math.max(1, ivl * 1.2); ease = Math.max(1.3, ease - 0.15); }
    else if (rating === 3) { ivl = reps === 0 ? 1 : reps === 1 ? 3 : ivl * ease; }
    else { ivl = reps === 0 ? 3 : reps === 1 ? 6 : ivl * ease * 1.3; ease += 0.15; }
    reps++; ivl = Math.round(ivl * 10) / 10; due = now + ivl * DAY;
  }
  return { ivl, ease: Math.round(ease * 100) / 100, reps, lapses, due, upd: now };
}

function statusOf(card) {
  const p = state.progress[card.id];
  if (!p) return "new";
  return p.ivl >= 7 ? "known" : "learning";
}
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
const isDue = (card, until = endOfToday()) => { const p = state.progress[card.id]; return !!p && p.due <= until; };

function deckStats(cards) {
  let n = 0, l = 0, k = 0, due = 0; const until = endOfToday();
  for (const c of cards) {
    const s = statusOf(c);
    if (s === "new") n++; else if (s === "learning") l++; else k++;
    if (isDue(c, until)) due++;
  }
  return { total: cards.length, new: n, learning: l, known: k, due };
}

function describeIvl(p) {
  if (!p) return "";
  const days = (p.due - Date.now()) / DAY;
  if (days < 1 / 24) return "gleich";
  if (days < 1) return `in ${Math.max(1, Math.round(days * 24))} Std.`;
  return `in ${Math.round(days)} ${Math.round(days) === 1 ? "Tag" : "Tagen"}`;
}
function preview(card, rating) {
  const p = schedule(state.progress[card.id], rating);
  if (rating === 1) return "10 Min.";
  if (p.ivl === 0) return "1 Std.";
  return p.ivl < 1.5 ? "1 Tag" : `${Math.round(p.ivl)} Tage`;
}


/* ---------- Einstellungen: aktive Fächer, Name, Theme ---------- */
// setup = { active: [deckIds], name: "" } – null bedeutet: noch nicht eingerichtet
let setup = store.get("setup", null);
const saveSetup = () => store.set("setup", setup);
const isActive = (id) => !!setup && setup.active.includes(id);
const activeDecks = () => allDecks().filter((d) => isActive(d.id));
const currentSemester = () => Math.max(1, ...state.index.filter((d) => d.count > 0).map((d) => d.semester));

function applyTheme() {
  const t = store.get("theme", "auto");
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const btn = document.getElementById("theme-btn");
  if (btn) btn.innerHTML = dark ? icon("sun") : icon("moon");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#0A0E16" : "#F5F3EF";
}
document.getElementById("theme-btn")?.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark";
  store.set("theme", dark ? "light" : "dark"); applyTheme();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);

/* ---------- Icons & Farben ---------- */
const ICONS = {
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  shuffle: '<path d="M4 7h3.5c4.5 0 5 10 9.5 10H20M4 17h3.5c1.8 0 2.8-1.6 3.7-3.5M13 10c.9-1.7 2-3 4-3H20"/><path d="m17.5 4.5 2.5 2.5-2.5 2.5M17.5 14.5l2.5 2.5-2.5 2.5"/>',
  alert: '<path d="M12 4 3 19.5h18z"/><path d="M12 10v4M12 17h.01"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10h14V9M10 13h4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  tap: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.5 15a1.5 1.5 0 0 1 2.3-1.9L9 15.5"/>',
};
const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
const HUES = ["#8B9BFF", "#34D3A0", "#F2B64C", "#F27561", "#5EC8F2", "#C58BFF", "#FF8FB8", "#9ED36A", "#F2D24C", "#6FE0D0", "#B0A0FF", "#FFA36B"];
const HUES_LIGHT = ["#4553E0", "#0E9E74", "#B7760E", "#D24F3B", "#1E8BC3", "#8A4FD8", "#D2487E", "#5C9A1E", "#A08500", "#0E9488", "#6A56E0", "#D2691E"];
function hueOf(id) {
  const i = Math.max(0, allDecks().findIndex((d) => d.id === id));
  return (document.documentElement.dataset.theme === "light" ? HUES_LIGHT : HUES)[i % HUES.length];
}
const ABBR = { BioPsy: "BIO", Stat1: "STAT", Einf: "EINF", Inferenz: "INF", Sozial: "SOZ", Klinisch: "KLIN", Entwicklung: "ENTW", Testtheorie: "TEST" };
const initials = (d) => ABBR[d.kurz] || (d.kurz || d.fach).replace(/[^A-Za-zÄÖÜäöüß0-9]/g, "").slice(0, 4).toUpperCase();
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function gauge(st, { size = "", label = "sitzen" } = {}) {
  const r = 42, C = 2 * Math.PI * r;
  const k = st.total ? st.known / st.total : 0, l = st.total ? st.learning / st.total : 0;
  const seg = (frac, off, color) => frac > 0 ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${Math.max(0, frac * C - 3)} ${C}" stroke-dashoffset="${-off * C}"/>` : "";
  return `<div class="gauge ${size}" role="img" aria-label="${pct(st.known, st.total)} Prozent sitzen">
    <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--track)" stroke-width="8"/>
      ${seg(l, k, "var(--amber)")}${seg(k, 0, "var(--ok)")}</svg>
    <div class="center"><b>${pct(st.known, st.total)}<small>%</small></b><span>${label}</span></div></div>`;
}

/* ---------- Router ---------- */
function parseHash() {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  return { parts, q: new URLSearchParams(query) };
}
function setNav(key) {
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === key));
  document.body.classList.toggle("learning", key === "learn");
}
function route() {
  const { parts, q } = parseHash();
  window.scrollTo(0, 0);
  if (!setup && parts[0] !== "konto") return viewSetup(true);
  if (parts[0] === "fach" && parts[1]) return viewDeck(decodeURIComponent(parts[1]));
  if (parts[0] === "lernen") return viewLearn(q);
  if (parts[0] === "faecher") return viewSetup(false);
  if (parts[0] === "eigene") return viewOwn(q);
  if (parts[0] === "konto") return viewAccount();
  return viewHome();
}
window.addEventListener("hashchange", route);

/* ---------- Fächer wählen (Einrichtung) ---------- */
function viewSetup(first) {
  setNav(first ? "" : "faecher");
  const decks = allDecks();
  const sems = [...new Set(decks.map((d) => d.semester))].sort((a, b) => b - a);
  const cur = currentSemester();
  let chosen = new Set(setup ? setup.active : decks.filter((d) => d.semester === cur).map((d) => d.id));
  let name = setup?.name || "";

  $app.innerHTML = `
    <div class="eyebrow">${first ? "Willkommen" : "Einstellungen"}</div>
    <h1 style="margin-top:10px">${first ? "Was lernst du gerade?" : "Meine Fächer"}</h1>
    <p class="muted" style="margin-top:12px;max-width:40em">Wähle die Fächer, für die du gerade lernst – zum Beispiel das aktuelle Semester oder eine Klausur, die du nachschreibst.
      Nur diese Fächer zählen bei „fällig“ und landen in deinen Lernrunden. Alles andere bleibt im Archiv und ist jederzeit abrufbar.</p>
    <div class="panel section form" style="max-width:520px">
      <label><span>Dein Vorname <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:500">· optional, bleibt auf diesem Gerät</span></span>
        <input id="name" value="${esc(name)}" placeholder="z. B. Lena" autocomplete="given-name" maxlength="30"></label>
    </div>
    <div id="pick"></div>
    <div class="sticky-save">
      <span class="muted" id="sel-info"></span>
      <button class="btn primary" id="save">${first ? "Los geht’s" : "Speichern"}</button>
    </div>
    ${first ? "" : `<p class="small faint" style="margin-top:22px">Lernstand sichern, Anmeldung und Datenschutz: <a href="#/konto">Konto</a></p>`}`;

  const render = () => {
    document.getElementById("pick").innerHTML = sems.map((s) => {
      const list = decks.filter((d) => d.semester === s);
      const all = list.every((d) => chosen.has(d.id));
      return `<div class="pick-sem"><div class="ph">
          <div class="sem-label" style="margin:0">Semester ${romans[s] || s}${s === cur ? " · aktuell" : ""}</div>
          <button class="btn ghost small" data-sem="${s}" style="min-height:32px;padding:4px 10px">${all ? "Keins" : "Alle"} wählen</button></div>
        <div class="pick-grid">${list.map((d) => {
          const n = cardsOf(d.id).length;
          return `<button type="button" class="pick ${chosen.has(d.id) ? "on" : ""}" data-id="${esc(d.id)}" aria-pressed="${chosen.has(d.id)}">
            <span class="badge" style="--hue:${hueOf(d.id)}">${esc(initials(d))}</span>
            <span class="t"><b>${esc(d.fach)}</b><span>${n ? `${n} Karten` : "noch keine Folien"}${d.dozent ? ` · ${esc(d.dozent)}` : ""}</span></span>
            <span class="box">${icon("check")}</span></button>`;
        }).join("")}</div></div>`;
    }).join("");
    const n = [...chosen].reduce((a, id) => a + cardsOf(id).length, 0);
    document.getElementById("sel-info").textContent = chosen.size ? `${chosen.size} ${chosen.size === 1 ? "Fach" : "Fächer"} · ${n} Karten` : "Noch kein Fach gewählt";
  };
  document.getElementById("pick").addEventListener("click", (e) => {
    const p = e.target.closest(".pick"), s = e.target.closest("[data-sem]");
    if (p) { chosen.has(p.dataset.id) ? chosen.delete(p.dataset.id) : chosen.add(p.dataset.id); render(); }
    if (s) {
      const list = decks.filter((d) => d.semester === Number(s.dataset.sem));
      const all = list.every((d) => chosen.has(d.id));
      list.forEach((d) => (all ? chosen.delete(d.id) : chosen.add(d.id))); render();
    }
  });
  document.getElementById("save").onclick = () => {
    if (!chosen.size) { toast("Wähle mindestens ein Fach."); return; }
    setup = { active: [...chosen], name: document.getElementById("name").value.trim().slice(0, 30) };
    saveSetup(); toast("Gespeichert");
    location.hash = "#/"; if (first) route();
  };
  render();
}

/* ---------- Übersicht ---------- */
function greeting() {
  const h = new Date().getHours();
  const g = h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : h < 22 ? "Guten Abend" : "Gute Nacht";
  return setup?.name ? `${g}, ${esc(setup.name)}` : g;
}
function viewHome() {
  setNav("home");
  const act = activeDecks();
  const cards = act.flatMap((d) => cardsOf(d.id));
  const s = deckStats(cards);
  const todayNew = Math.min(NEW_PER_SESSION, s.new);
  const todo = s.due + todayNew;
  const date = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

  let headline, sub;
  if (!cards.length) { headline = "Deine Fächer haben noch keine Karten."; sub = "Sobald die Folien hochgeladen sind, kommen hier Karten dazu. Bis dahin kannst du im Archiv stöbern oder eigene Karten anlegen."; }
  else if (todo) { headline = s.due ? `${s.due} Karten sind heute fällig.` : "Zeit für neue Karten."; sub = `${s.due ? `Dazu kommen bis zu ${todayNew} neue Karten.` : `Eine Runde bringt dir ${todayNew} neue Karten.`} Aus ${act.length} ${act.length === 1 ? "Fach" : "Fächern"}, die du gerade lernst.`; }
  else { headline = "Für heute ist alles erledigt."; sub = "Morgen sind wieder Karten fällig. Wenn du willst, geh die prüfungsrelevanten Karten noch einmal durch."; }

  let html = `
  <section class="hero">
    <div class="hero-main">
      <div class="eyebrow">${greeting()} · ${date}</div>
      <h1>${headline}</h1>
      <p class="hero-sub">${sub}</p>
      <div class="tiles">
        <div class="tile amber"><div class="lbl">${icon("clock")} Fällig</div><div class="val">${s.due}</div></div>
        <div class="tile acc"><div class="lbl">${icon("spark")} Neu</div><div class="val">${s.new}</div></div>
        <div class="tile ok"><div class="lbl">${icon("check")} Sitzen</div><div class="val">${s.known}<small> / ${s.total}</small></div></div>
        <div class="tile"><div class="lbl">${icon("flame")} Serie</div><div class="val">${streak()}<small> ${streak() === 1 ? "Tag" : "Tage"}</small></div></div>
      </div>
      <div class="hero-cta">
        <a class="btn primary big" href="#/lernen?deck=active&mode=faellig"${todo ? "" : " aria-disabled"}>${icon("play")} ${todo ? `Jetzt lernen · ${todo}` : "Nichts fällig"}</a>
        <a class="btn big" href="#/lernen?deck=active&mode=pruefung">${icon("target")} Prüfungsrelevant</a>
      </div>
    </div>
    <div class="hero-side">
      ${gauge(s)}
      <div class="legend"><span><i style="background:var(--ok)"></i>sitzt · ${s.known}</span><span><i style="background:var(--amber)"></i>in Arbeit · ${s.learning}</span><span><i style="background:var(--track)"></i>neu · ${s.new}</span></div>
    </div>
  </section>

  <div class="sec-head"><div><span class="eyebrow dim">Aktiv</span><h2>Deine Fächer</h2></div>
    <a class="btn ghost" href="#/faecher">${icon("settings")} Fächer ändern</a></div>
  <div class="grid">${act.map((d) => deckTile(d)).join("") || `<div class="deck empty"><p class="muted">Noch keine Fächer gewählt. <a href="#/faecher">Fächer wählen</a></p></div>`}</div>`;

  const rest = allDecks().filter((d) => !isActive(d.id));
  if (rest.length) {
    const sems = [...new Set(rest.map((d) => d.semester))].sort((a, b) => b - a);
    const n = rest.reduce((a, d) => a + cardsOf(d.id).length, 0);
    html += `<details class="archive section" ${store.get("archiveOpen", false) ? "open" : ""}>
      <summary><span class="badge" style="--hue:var(--dim)">${icon("archive")}</span>
        <span><b>Archiv</b><br><span class="small muted">${rest.length} weitere Fächer · ${n} Karten · zählen nicht als fällig</span></span>
        <span class="chev">${icon("chev")}</span></summary>
      <div class="inner">${sems.map((sem) => `<div class="sem-label">Semester ${romans[sem] || sem}</div>
        <div class="grid">${rest.filter((d) => d.semester === sem).map((d) => deckTile(d, true)).join("")}</div>`).join("")}</div>
    </details>`;
  }
  html += `<p class="small faint" style="margin-top:28px;text-align:center">Karten nach den Vorlesungsfolien · <a href="#/konto">Konto & Sicherung</a> · <a href="datenschutz.html">Datenschutz</a></p>`;
  $app.innerHTML = html;
  $app.querySelector(".archive")?.addEventListener("toggle", (e) => store.set("archiveOpen", e.target.open));
}

function deckTile(d, compact = false) {
  const cards = cardsOf(d.id);
  const st = deckStats(cards);
  const hue = hueOf(d.id);
  const exam = cards.filter((c) => c.exam).length;
  if (!st.total) {
    return `<a class="deck empty ${compact ? "compact" : ""}" href="#/fach/${encodeURIComponent(d.id)}">
      <div class="d-top"><span class="badge" style="--hue:${hue}">${esc(initials(d))}</span>
        <div><h3>${esc(d.fach)}</h3><div class="who">${d.dozent ? esc(d.dozent) : `Semester ${romans[d.semester] || d.semester}`}</div></div></div>
      <p class="small muted">Noch keine Folien hochgeladen – Karten folgen.</p></a>`;
  }
  return `<a class="deck ${compact ? "compact" : ""}" href="#/fach/${encodeURIComponent(d.id)}">
    <div class="d-top"><span class="badge" style="--hue:${hue}">${esc(initials(d))}</span>
      <div><h3>${esc(d.fach)}</h3><div class="who">${d.dozent ? esc(d.dozent) : `Semester ${romans[d.semester] || d.semester}`}</div></div>
      ${!compact && st.due ? `<span class="pill due">${st.due} fällig</span>` : ""}</div>
    ${compact ? `${bar(st)}<div class="foot"><span>${st.total} Karten</span><span>${pct(st.known, st.total)} % sitzen</span></div>` : `
    <div class="nums"><span class="big">${st.total}</span><span class="unit">Karten</span>
      <span class="right">${pct(st.known, st.total)} % sitzen<br>${exam} prüfungsrelevant</span></div>
    ${bar(st)}
    <div class="foot"><span>${st.new} neu · ${st.learning} in Arbeit</span><span>${countTopics(cards)} Themen</span></div>`}
  </a>`;
}
const countTopics = (cards) => new Set(cards.map((c) => c.topic || "Allgemein")).size;

function bar(st) {
  if (!st.total) return `<div class="bar"></div>`;
  const k = (st.known / st.total) * 100, l = (st.learning / st.total) * 100;
  return `<div class="bar" aria-label="${st.known} sitzen, ${st.learning} in Arbeit, ${st.new} neu"><i class="b-known" style="width:${k}%"></i><i class="b-learning" style="width:${l}%"></i></div>`;
}

function streak() {
  const days = new Set(store.get("days", []));
  let n = 0; const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function markToday() {
  const days = store.get("days", []); const t = new Date().toDateString();
  if (!days.includes(t)) { days.push(t); store.set("days", days.slice(-400)); }
}

/* ---------- Fach ---------- */
const isWeak = (c) => { const p = state.progress[c.id]; return p && (p.lapses > 0 || p.ease < 2.2); };
function viewDeck(id) {
  setNav(isActive(id) ? "home" : "home");
  const d = deckById(id);
  if (!d) { $app.innerHTML = `<p class="pad">Fach nicht gefunden. <a href="#/">Zur Übersicht</a></p>`; return; }
  const cards = cardsOf(id);
  const st = deckStats(cards);
  const topics = [...new Set(cards.map((c) => c.topic || "Allgemein"))];
  const exam = cards.filter((c) => c.exam).length;
  const hue = hueOf(id);
  let topic = "";
  const link = (mode) => `#/lernen?deck=${encodeURIComponent(id)}&mode=${mode}${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`;

  $app.innerHTML = `
    <a class="back" href="#/">${icon("back")} Übersicht</a>
    <section class="hero deck-hero" style="--glow:color-mix(in oklab, ${hue} 16%, transparent)">
      <div class="hero-main">
        <div class="eyebrow" style="color:${hue}">Semester ${romans[d.semester] || d.semester}${d.dozent ? ` · ${esc(d.dozent)}` : ""}</div>
        <h1>${esc(d.fach)}</h1>
        <div class="meta-row">
          <span class="pill">${st.total} Karten</span>
          <span class="pill">${topics.length} ${topics.length === 1 ? "Thema" : "Themen"}</span>
          ${exam ? `<span class="pill exam">${exam} prüfungsrelevant</span>` : ""}
          ${st.due ? `<span class="pill due">${st.due} fällig</span>` : ""}
        </div>
        <div class="btn-row">
          <button class="btn ${isActive(id) ? "" : "primary"}" id="toggle-active">${isActive(id) ? `${icon("check")} Aktives Fach` : `${icon("plus")} Zu meinen Fächern`}</button>
          <span class="small muted">${isActive(id) ? "Zählt bei „fällig“ auf der Übersicht." : "Gerade im Archiv – zählt nicht als fällig."}</span>
        </div>
      </div>
      <div class="hero-side">${gauge(st, { size: "mini-gauge" })}</div>
    </section>
    ${st.total ? `
    <div class="modes" id="modes"></div>
    <div class="sec-head" style="margin-top:30px"><div><span class="eyebrow dim">Nach Vorlesung</span><h2>Themen</h2></div></div>
    <div class="topics" id="topics">
      <button class="chip on" data-t="">Alle<span class="n">${cards.length}</span></button>
      ${topics.map((t) => `<button class="chip" data-t="${esc(t)}">${esc(t)}<span class="n">${cards.filter((c) => (c.topic || "Allgemein") === t).length}</span></button>`).join("")}
    </div>
    <input class="search" id="search" type="search" placeholder="Karten durchsuchen …" aria-label="Karten durchsuchen">
    <ul class="list" id="list"></ul>` : `
    <div class="note section">${icon("info")}<div>Für dieses Fach sind noch keine Vorlesungsfolien hochgeladen. Sobald die Folien da sind, kommen passende Karten dazu. Du kannst aber schon <a href="#/eigene?deck=${encodeURIComponent(id)}">eigene Karten anlegen</a>.</div></div>`}
    <p class="small faint" style="margin-top:18px"><a href="#/eigene?deck=${encodeURIComponent(id)}">+ Eigene Karte zu diesem Fach</a></p>`;

  document.getElementById("toggle-active").onclick = () => {
    if (!setup) setup = { active: [], name: "" };
    setup.active = isActive(id) ? setup.active.filter((x) => x !== id) : [...setup.active, id];
    saveSetup(); toast(isActive(id) ? "Zu deinen Fächern hinzugefügt" : "Ins Archiv verschoben"); viewDeck(id);
  };
  if (!st.total) return;

  const renderModes = () => {
    const pool = topic ? cards.filter((c) => (c.topic || "Allgemein") === topic) : cards;
    const s2 = deckStats(pool);
    const ex = pool.filter((c) => c.exam).length;
    const wk = pool.filter(isWeak).length;
    const todo = s2.due + Math.min(NEW_PER_SESSION, s2.new);
    document.getElementById("modes").innerHTML = `
      <a class="mode primary" href="${link("faellig")}" ${todo ? "" : "disabled"}><span class="m-ic">${icon("play")}</span><b>Lernen</b><span>${s2.due} fällig · ${Math.min(NEW_PER_SESSION, s2.new)} neue</span></a>
      <a class="mode" href="${link("pruefung")}" ${ex ? "" : "disabled"}><span class="m-ic" style="color:var(--coral)">${icon("target")}</span><b>Prüfungsrelevant</b><span>${ex ? `${ex} markierte Karten` : "keine markiert"}</span></a>
      <a class="mode" href="${link("alle")}"><span class="m-ic">${icon("shuffle")}</span><b>Alle durchgehen</b><span>${pool.length} Karten, gemischt</span></a>
      <a class="mode" href="${link("schwach")}" ${wk ? "" : "disabled"}><span class="m-ic" style="color:var(--amber)">${icon("alert")}</span><b>Schwachstellen</b><span>${wk ? `${wk} Karten, die hakten` : "noch keine"}</span></a>`;
  };
  const renderList = () => {
    const term = document.getElementById("search").value.trim().toLowerCase();
    const items = cards.filter((c) => (!topic || (c.topic || "Allgemein") === topic) && (!term || (c.q + " " + c.a).toLowerCase().includes(term)));
    document.getElementById("list").innerHTML = items.slice(0, 300).map((c) => {
      const p = state.progress[c.id]; const s = statusOf(c);
      const tag = s === "new" ? `<span class="pill">neu</span>` : s === "known" ? `<span class="pill ok">sitzt</span>` : `<span class="pill due">in Arbeit</span>`;
      return `<li><details><summary><span>${c.exam ? `<span class="dot" style="color:var(--coral);margin-right:8px;vertical-align:2px" title="prüfungsrelevant"></span>` : ""}${esc(c.q)}</span>${tag}</summary>
        <div class="ans">${esc(c.a)}</div>
        <div class="row small faint"><span>${esc(c.topic || "")}${c.exam ? " · prüfungsrelevant" : ""}${c.own ? " · eigene Karte" : ""}${c.shared ? " · geteilt" : ""}</span><span>${p ? "nächste Wiederholung " + describeIvl(p) : ""}</span></div>
      </details></li>`;
    }).join("") || `<li class="muted">Keine Karten gefunden.</li>`;
  };
  document.getElementById("topics").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    topic = b.dataset.t;
    document.querySelectorAll("#topics .chip").forEach((x) => x.classList.toggle("on", x === b));
    renderModes(); renderList();
  });
  document.getElementById("search").addEventListener("input", renderList);
  renderModes(); renderList();
}

/* ---------- Lernen ---------- */
let keyHandler = null;
function viewLearn(q) {
  setNav("learn");
  let deckParam = q.get("deck") || "active";
  if (deckParam === "all") deckParam = "active";
  const mode = q.get("mode") || "faellig";
  const topic = q.get("topic") || "";
  let pool, title, backHref;
  if (deckParam === "active") { pool = activeDecks().flatMap((d) => cardsOf(d.id)); title = "Meine Fächer"; backHref = "#/"; }
  else if (deckParam.startsWith("sem-")) {
    const sem = Number(deckParam.slice(4));
    pool = allDecks().filter((d) => d.semester === sem).flatMap((d) => cardsOf(d.id));
    title = `Semester ${romans[sem] || sem}`; backHref = "#/";
  } else {
    const d = deckById(deckParam); pool = cardsOf(deckParam); title = d ? d.fach : "Fach"; backHref = `#/fach/${encodeURIComponent(deckParam)}`;
  }
  if (topic) { pool = pool.filter((c) => (c.topic || "Allgemein") === topic); title += ` · ${topic}`; }
  const modeName = { faellig: "Lernen", alle: "Alle", pruefung: "Prüfungsrelevant", schwach: "Schwachstellen" }[mode] || "";

  let queue;
  if (mode === "alle") queue = shuffle(pool);
  else if (mode === "pruefung") queue = shuffle(pool.filter((c) => c.exam));
  else if (mode === "schwach") queue = shuffle(pool.filter(isWeak));
  else {
    const due = pool.filter((c) => isDue(c, Date.now())).sort((a, b) => state.progress[a.id].due - state.progress[b.id].due);
    // neue Karten in Vorlesungsreihenfolge, abwechselnd aus den Fächern
    const fresh = [];
    const byDeck = new Map();
    for (const c of pool) if (!state.progress[c.id]) { if (!byDeck.has(c.deckId)) byDeck.set(c.deckId, []); byDeck.get(c.deckId).push(c); }
    const lists = [...byDeck.values()];
    while (fresh.length < NEW_PER_SESSION && lists.some((l) => l.length)) for (const l of lists) if (l.length && fresh.length < NEW_PER_SESSION) fresh.push(l.shift());
    queue = [...shuffle(due), ...fresh];
  }

  const total = queue.length;
  let done = 0, shown = false; const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };

  const render = () => {
    if (!queue.length) {
      if (keyHandler) document.removeEventListener("keydown", keyHandler);
      $app.innerHTML = `<div class="learn"><div class="done">
        <div class="big">${icon(total ? "check" : "clock")}</div>
        <h1>${total ? "Runde geschafft" : "Gerade nichts zu lernen"}</h1>
        <p class="muted" style="margin-top:10px">${total ? `${total} Karten durchgearbeitet.` : "Keine Karten fällig. Du kannst alle Karten durchgehen oder ein anderes Fach wählen."}</p>
        ${total ? `<div class="sum">
          <div><b style="color:var(--coral)">${counts[1]}</b><span>nochmal</span></div>
          <div><b style="color:var(--amber)">${counts[2]}</b><span>schwer</span></div>
          <div><b style="color:var(--ok)">${counts[3]}</b><span>gut</span></div>
          <div><b style="color:var(--acc)">${counts[4]}</b><span>leicht</span></div></div>` : ""}
        <div class="btn-row" style="justify-content:center;margin-top:26px">
          <a class="btn" href="${backHref}">Zurück</a>
          ${mode !== "alle" ? `<a class="btn primary" href="#/lernen?deck=${encodeURIComponent(deckParam)}&mode=alle${topic ? `&topic=${encodeURIComponent(topic)}` : ""}">Alle durchgehen</a>` : ""}
        </div></div></div>`;
      return;
    }
    const c = queue[0];
    const d = deckById(c.deckId);
    $app.innerHTML = `<div class="learn">
      <div class="learn-top">
        <a class="back" href="${backHref}">${icon("back")} ${esc(title)}</a>
        <span class="count">${modeName} · ${done} / ${total}</span>
      </div>
      <div class="progress"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
      <article class="card" id="card" aria-live="polite" style="--hue:${hueOf(c.deckId)}">
        <div class="tag">
          ${d ? `<span class="pill" style="color:${hueOf(c.deckId)}"><span class="dot"></span>${esc(d.kurz || d.fach)}</span>` : ""}
          ${c.exam ? `<span class="pill exam">prüfungsrelevant</span>` : ""}
          ${!state.progress[c.id] ? `<span class="pill acc">neu</span>` : ""}
          ${c.own ? `<span class="pill">eigene</span>` : ""}${c.shared ? `<span class="pill">geteilt</span>` : ""}
        </div>
        <div class="kicker">${esc(c.topic || "Allgemein")}</div>
        <div class="q">${esc(c.q)}</div>
        ${shown ? `<div class="a">${esc(c.a)}</div>` : `<div class="hint">${icon("tap")} Tippen oder Leertaste zum Aufdecken</div>`}
      </article>
      ${shown ? `<div class="rate">
          <button class="r1" data-r="1"><b>Nochmal</b><span>${preview(c, 1)}</span></button>
          <button class="r2" data-r="2"><b>Schwer</b><span>${preview(c, 2)}</span></button>
          <button class="r3" data-r="3"><b>Gut</b><span>${preview(c, 3)}</span></button>
          <button class="r4" data-r="4"><b>Leicht</b><span>${preview(c, 4)}</span></button>
        </div>` : `<button class="btn primary big reveal" id="reveal">${icon("eye")} Antwort zeigen</button>`}
      <p class="keys"><kbd>Leertaste</kbd> aufdecken · <kbd>1</kbd>–<kbd>4</kbd> bewerten</p>
    </div>`;
    document.getElementById("card").onclick = () => { if (!shown) { shown = true; render(); } };
    const rv = document.getElementById("reveal"); if (rv) rv.onclick = () => { shown = true; render(); };
    document.querySelectorAll(".rate button").forEach((b) => (b.onclick = () => rate(Number(b.dataset.r))));
  };

  const rate = (r) => {
    const c = queue.shift();
    const p = schedule(state.progress[c.id], r);
    state.progress[c.id] = p; saveProgress(); markToday();
    Sync.queueProgress(c.id, p);
    counts[r]++;
    if (r === 1) queue.splice(Math.min(3, queue.length), 0, c); else done++;
    shown = false; render();
  };

  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = (e) => {
    if (!location.hash.startsWith("#/lernen")) { document.removeEventListener("keydown", keyHandler); return; }
    if (e.target.matches("input, textarea, select")) return;
    if (!shown && (e.key === " " || e.key === "Enter")) { e.preventDefault(); shown = true; render(); }
    else if (shown && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key));
  };
  document.addEventListener("keydown", keyHandler);
  render();
}

/* ---------- Eigene Karten ---------- */
function viewOwn(q) {
  setNav("eigene");
  const decks = allDecks();
  const pre = q.get("deck") || decks[decks.length - 1]?.id || "";
  const mine = state.own.filter((c) => !c.deleted);
  const deckOptions = (sel) => decks.map((d) => `<option value="${esc(d.id)}" ${d.id === sel ? "selected" : ""}>S${d.semester} · ${esc(d.fach)}</option>`).join("") + `<option value="__new">+ Neues Fach …</option>`;

  $app.innerHTML = `
    <div class="eyebrow">Selbst erstellt</div>
    <h1 style="margin-top:10px">Eigene Karten</h1>
    <p class="muted" style="margin-top:12px;max-width:42em">Deine Karten landen im gewählten Fach und werden dort mitgelernt.${state.syncOn ? " Mit „für alle teilen“ sehen sie auch deine Freunde." : ""}</p>

    <section class="section panel">
      <h2 style="margin-bottom:12px" id="form-title">Neue Karte</h2>
      <form class="form" id="add">
        <input type="hidden" name="id">
        <div class="two">
          <label>Fach<select name="deck" id="deck-sel">${deckOptions(pre)}</select></label>
          <label>Thema<input name="topic" placeholder="z. B. Bindung" list="topic-list"></label>
        </div>
        <div class="two" id="new-deck" hidden>
          <label>Neues Fach<input name="newFach" placeholder="z. B. Sozialpsychologie II"></label>
          <label>Semester<input name="newSem" type="number" min="1" max="10" value="${Math.max(...decks.map((d) => d.semester), 1)}"></label>
        </div>
        <datalist id="topic-list"></datalist>
        <label>Frage<textarea name="q" required rows="2"></textarea></label>
        <label>Antwort<textarea name="a" required rows="4"></textarea></label>
        <label class="check"><input type="checkbox" name="exam"> prüfungsrelevant</label>
        ${state.syncOn ? `<label class="check"><input type="checkbox" name="shared"> für alle teilen</label>` : ""}
        <div class="btn-row"><button class="btn primary" type="submit">Speichern</button><button class="btn ghost" type="reset" id="cancel-edit">Leeren</button></div>
      </form>
    </section>

    <section class="section panel">
      <h2 style="margin-bottom:6px">Mehrere Karten importieren</h2>
      <p class="muted small" style="margin-top:0">Eine Karte pro Zeile: <code>Frage;Antwort;Thema</code> (Thema optional). Semikolon, Tab oder Komma als Trennzeichen – also direkt aus Excel, Numbers oder einer Anki-Textdatei.</p>
      <form class="form" id="imp">
        <label>Fach<select name="deck">${deckOptions(pre).replace('<option value="__new">+ Neues Fach …</option>', "")}</select></label>
        <label>Inhalt<textarea name="text" rows="5" placeholder="Was ist Assimilation?;Neue Information wird ins bestehende Schema eingepasst.;Piaget"></textarea></label>
        <div class="btn-row"><label class="btn" style="cursor:pointer">Datei wählen<input type="file" id="imp-file" accept=".csv,.txt,.tsv" hidden></label><button class="btn primary" type="submit">Importieren</button></div>
      </form>
    </section>

    <section class="section">
      <h2 style="margin-bottom:12px">Deine Karten (${mine.length})</h2>
      <ul class="list" id="own-list">${mine.length ? "" : `<li class="muted">Noch keine eigenen Karten.</li>`}</ul>
    </section>

    <section class="section panel">
      <h2 style="margin-bottom:6px">Sichern und weitergeben</h2>
      <p class="muted small" style="margin-top:0">„Für Claude exportieren“ erzeugt eine Textdatei im Format des Repos – leg sie in den Ordner <code>quellen/</code> oder schick sie mir, dann nehme ich die Karten fest in die App auf.</p>
      <div class="btn-row">
        <button class="btn" id="exp-txt">Für Claude exportieren</button>
        <button class="btn" id="exp-backup">Backup herunterladen</button>
        <label class="btn" style="cursor:pointer">Backup einspielen<input type="file" id="imp-backup" accept=".json" hidden></label>
      </div>
    </section>`;

  const form = document.getElementById("add");
  const sel = document.getElementById("deck-sel");
  const fillTopics = () => {
    const topics = [...new Set(cardsOf(sel.value).map((c) => c.topic).filter(Boolean))];
    document.getElementById("topic-list").innerHTML = topics.map((t) => `<option value="${esc(t)}">`).join("");
    document.getElementById("new-deck").hidden = sel.value !== "__new";
  };
  sel.onchange = fillTopics; fillTopics();

  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    let deckId = f.get("deck");
    if (deckId === "__new") {
      const fach = String(f.get("newFach") || "").trim();
      if (!fach) { toast("Bitte einen Fachnamen eingeben."); return; }
      const semester = Number(f.get("newSem")) || 1;
      deckId = `s${semester}-${slug(fach)}`;
      if (!deckById(deckId)) state.customDecks.push({ id: deckId, semester, fach, kurz: fach.split(" ")[0] });
    }
    const id = f.get("id");
    const card = {
      id: id || "u-" + uid(), deckId, topic: String(f.get("topic") || "").trim() || "Eigene",
      q: String(f.get("q")).trim(), a: String(f.get("a")).trim(),
      exam: !!f.get("exam"), shared: !!f.get("shared"), upd: Date.now(),
    };
    const i = state.own.findIndex((c) => c.id === card.id);
    if (i >= 0) state.own[i] = { ...state.own[i], ...card }; else state.own.push(card);
    saveOwn(); Sync.saveOwnCard(card);
    toast(id ? "Karte aktualisiert" : "Karte gespeichert");
    viewOwn(new URLSearchParams({ deck: deckId }));
  };
  document.getElementById("cancel-edit").onclick = () => { form.id.value = ""; document.getElementById("form-title").textContent = "Neue Karte"; };

  const list = document.getElementById("own-list");
  if (mine.length) {
    list.innerHTML = mine.slice().reverse().map((c) => {
      const d = deckById(c.deckId);
      return `<li><details><summary><span>${esc(c.q)}</span><span class="pill">${esc(d?.kurz || "")}</span></summary>
        <div class="ans">${esc(c.a)}</div>
        <div class="row"><span class="small faint">${esc(d?.fach || c.deckId)} · ${esc(c.topic)}${c.exam ? " · prüfungsrelevant" : ""}${c.shared ? " · geteilt" : ""}</span>
        <span class="btn-row"><button class="btn ghost" data-edit="${esc(c.id)}">Bearbeiten</button><button class="btn ghost danger" data-del="${esc(c.id)}">Löschen</button></span></div>
      </details></li>`;
    }).join("");
  }
  list.onclick = (e) => {
    const ed = e.target.closest("[data-edit]"), dl = e.target.closest("[data-del]");
    if (ed) {
      const c = state.own.find((x) => x.id === ed.dataset.edit);
      form.id.value = c.id; sel.value = c.deckId; fillTopics();
      form.topic.value = c.topic; form.q.value = c.q; form.a.value = c.a; form.exam.checked = !!c.exam;
      if (form.shared) form.shared.checked = !!c.shared;
      document.getElementById("form-title").textContent = "Karte bearbeiten";
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (dl) {
      if (!confirm("Diese Karte löschen?")) return;
      const c = state.own.find((x) => x.id === dl.dataset.del);
      c.deleted = true; c.upd = Date.now(); saveOwn(); Sync.deleteOwnCard(c.id);
      toast("Karte gelöscht"); viewOwn(q);
    }
  };

  // Import
  const impForm = document.getElementById("imp");
  document.getElementById("imp-file").onchange = async (e) => {
    const file = e.target.files[0]; if (file) impForm.text.value = await file.text();
  };
  impForm.onsubmit = (e) => {
    e.preventDefault();
    const deckId = impForm.deck.value;
    const rows = parseRows(impForm.text.value);
    if (!rows.length) { toast("Keine Zeilen mit Frage und Antwort gefunden."); return; }
    for (const [qq, aa, tt] of rows) {
      const card = { id: "u-" + uid(), deckId, topic: tt || "Import", q: qq, a: aa, exam: false, shared: false, upd: Date.now() };
      state.own.push(card); Sync.saveOwnCard(card);
    }
    saveOwn(); toast(`${rows.length} Karten importiert`); viewOwn(new URLSearchParams({ deck: deckId }));
  };

  // Export
  document.getElementById("exp-txt").onclick = () => {
    const byDeck = new Map();
    for (const c of mine) { if (!byDeck.has(c.deckId)) byDeck.set(c.deckId, []); byDeck.get(c.deckId).push(c); }
    if (!byDeck.size) { toast("Noch keine eigenen Karten."); return; }
    let out = "% Export aus der Lernkarten-App – " + new Date().toLocaleDateString("de-DE") + "\n";
    for (const [deckId, cs] of byDeck) {
      const d = deckById(deckId) || { semester: 0, fach: deckId, kurz: deckId };
      out += `\n@semester ${d.semester}\n@fach ${d.fach}\n@kurz ${d.kurz || d.fach}\n`;
      let last = null;
      for (const c of cs) {
        if (c.topic !== last) { out += `## ${c.topic}\n`; last = c.topic; }
        out += `${c.exam ? "!" : ""}${oneLine(c.q)} || ${c.a.split("\n").map(oneLine).join(" // ")}\n`;
      }
    }
    download(`eigene-karten-${new Date().toISOString().slice(0, 10)}.txt`, out, "text/plain");
  };
  document.getElementById("exp-backup").onclick = () => {
    download(`lernkarten-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ version: 2, progress: state.progress, own: state.own, customDecks: state.customDecks, days: store.get("days", []), setup }, null, 1), "application/json");
  };
  document.getElementById("imp-backup").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      mergeProgress(data.progress || {});
      for (const c of data.own || []) { const i = state.own.findIndex((x) => x.id === c.id); if (i < 0) state.own.push(c); else if ((c.upd || 0) > (state.own[i].upd || 0)) state.own[i] = c; }
      for (const d of data.customDecks || []) if (!state.customDecks.some((x) => x.id === d.id)) state.customDecks.push(d);
      store.set("days", [...new Set([...store.get("days", []), ...(data.days || [])])]);
      if (data.setup && !setup) { setup = data.setup; saveSetup(); }
      saveProgress(); saveOwn(); toast("Backup eingespielt"); viewOwn(q);
    } catch { toast("Die Datei konnte nicht gelesen werden."); }
  };
}

const oneLine = (s) => String(s).replace(/\s*\|\|\s*/g, " | ").replace(/\s+/g, " ").trim();
function parseRows(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const rows = [];
  for (const l of lines) {
    const cols = splitCsv(l, sep).map((x) => x.trim());
    if (cols.length >= 2 && cols[0] && cols[1]) rows.push([cols[0], cols[1], cols[2] || ""]);
  }
  if (rows.length && /^(frage|question|front|vorderseite)$/i.test(rows[0][0])) rows.shift();
  return rows;
}
function splitCsv(line, sep) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type: type + ";charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function mergeProgress(incoming) {
  for (const [id, p] of Object.entries(incoming)) {
    const cur = state.progress[id];
    if (!cur || (p.upd || 0) > (cur.upd || 0)) state.progress[id] = p;
  }
}

/* ---------- Konto ---------- */
function viewAccount() {
  setNav("konto");
  const cfg = window.LERNKARTEN_CONFIG || {};
  if (!cfg.supabaseUrl) {
    $app.innerHTML = `<div class="eyebrow">Konto</div><h1 style="margin-top:10px">Lernstand & Sicherung</h1>
      <div class="section note">${icon("info")}<div>Die App läuft gerade <b>nur lokal</b>: Dein Lernstand liegt in diesem Browser. Auf dem iPhone und am Mac ist er deshalb getrennt.
      Sobald Supabase eingerichtet ist (Werte in <code>config.js</code>), kannst du dich hier anmelden, und alles wird geräteübergreifend gespeichert.</div>
      <div class="section panel"><h2 style="margin-bottom:8px">Lernstand</h2>
      <p class="muted small" style="margin-bottom:14px">Zum Sichern oder Umziehen auf ein anderes Gerät: <a href="#/eigene">Eigene Karten → Backup herunterladen</a>.</p>
      <div class="btn-row"><a class="btn" href="#/faecher">${icon("settings")} Meine Fächer</a><button class="btn danger" id="reset">Lernstand zurücksetzen</button></div></div>
      <p class="small faint" style="margin-top:20px"><a href="datenschutz.html">Datenschutz</a></p>`;
  } else if (!state.user) {
    $app.innerHTML = `<div class="eyebrow">Konto</div><h1 style="margin-top:10px">Anmelden</h1>
      <p class="muted">Du bekommst einen Anmeldelink per E-Mail. Danach werden Lernstand und eigene Karten auf allen Geräten synchronisiert.</p>
      <form class="form panel section" id="login" style="max-width:460px">
        <label>E-Mail<input type="email" name="email" required autocomplete="email"></label>
        <button class="btn primary" type="submit">Anmeldelink schicken</button>
      </form>
      <p class="small faint">Ohne Anmeldung funktioniert die App weiter lokal. <a href="datenschutz.html">Datenschutz</a></p>`;
    document.getElementById("login").onsubmit = async (e) => {
      e.preventDefault();
      const email = e.target.email.value.trim();
      const err = await Sync.signIn(email, location.origin + location.pathname);
      toast(err ? "Fehler: " + err : "Link verschickt – schau in dein Postfach.");
    };
  } else {
    $app.innerHTML = `<div class="eyebrow">Konto</div><h1 style="margin-top:10px">Konto</h1>
      <div class="section panel"><p style="margin-top:0">Angemeldet als <b>${esc(state.user.email)}</b></p>
      <p class="muted small">Lernstand und eigene Karten werden automatisch synchronisiert.</p>
      <div class="btn-row"><button class="btn" id="sync-now">Jetzt synchronisieren</button><button class="btn ghost" id="logout">Abmelden</button></div></div>
      <div class="section"><button class="btn danger" id="reset">Lernstand zurücksetzen</button></div>
      <p class="small faint"><a href="datenschutz.html">Datenschutz</a></p>`;
    document.getElementById("sync-now").onclick = async () => { await fullSync(); toast("Synchronisiert"); };
    document.getElementById("logout").onclick = async () => { await Sync.signOut(); state.user = null; state.remote = []; route(); };
  }
  const reset = document.getElementById("reset");
  if (reset) reset.onclick = () => {
    if (!confirm("Wirklich den gesamten Lernstand in diesem Browser zurücksetzen? Eigene Karten bleiben erhalten.")) return;
    state.progress = {}; saveProgress(); store.set("days", []); toast("Lernstand zurückgesetzt");
  };
}

/* ---------- Sync ---------- */
async function fullSync() {
  if (!state.user) return;
  const res = await Sync.pullAll();
  if (!res) return;
  mergeProgress(res.progress);
  // lokale neuere Stände hochladen
  const push = {};
  for (const [id, p] of Object.entries(state.progress)) { const r = res.progress[id]; if (!r || (p.upd || 0) > (r.upd || 0)) push[id] = p; }
  await Sync.pushProgress(push);
  // eigene Karten zusammenführen
  for (const c of res.own) { const i = state.own.findIndex((x) => x.id === c.id); if (i < 0) state.own.push(c); else if ((c.upd || 0) > (state.own[i].upd || 0)) state.own[i] = c; }
  for (const c of state.own) { const r = res.own.find((x) => x.id === c.id); if (!r || (c.upd || 0) > (r.upd || 0)) await Sync.saveOwnCard(c); }
  for (const d of res.decks) if (!deckById(d.id)) state.customDecks.push(d);
  state.remote = res.shared;
  saveProgress(); saveOwn();
}

/* ---------- Start ---------- */
async function boot() {
  try {
    const idx = await (await fetch("cards/index.json", { cache: "no-cache" })).json();
    state.index = idx.decks;
    const decks = await Promise.all(idx.decks.map((d) => fetch(d.file, { cache: "no-cache" }).then((r) => r.json())));
    decks.forEach((d) => { d.cards.forEach((c) => (c.deckId = d.id)); state.decks.set(d.id, d); });
  } catch (e) {
    $app.innerHTML = `<p class="pad">Die Karten konnten nicht geladen werden. Bist du offline? <button class="btn" onclick="location.reload()">Neu laden</button></p>`;
    return;
  }
  applyTheme();
  route();

  const cfg = window.LERNKARTEN_CONFIG || {};
  if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
    try {
      state.syncOn = true;
      const user = await Sync.init(cfg, (u) => {
        const was = state.user; state.user = u;
        if (u && !was) fullSync().then(route);
        if (!u && was) route();
      });
      state.user = user;
      if (user) { await fullSync(); route(); }
    } catch (e) { console.warn("Sync nicht verfügbar", e); state.syncOn = false; }
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
