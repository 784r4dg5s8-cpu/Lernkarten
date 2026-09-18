// Lernkarten — statische App, Fortschritt lokal; optional Supabase-Sync (sync.js).
import * as Sync from "./sync.js";

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

/* ---------- Router ---------- */
function parseHash() {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  return { parts, q: new URLSearchParams(query) };
}
function setNav(key) {
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === key));
}
function route() {
  const { parts, q } = parseHash();
  window.scrollTo(0, 0);
  if (parts[0] === "fach" && parts[1]) return viewDeck(decodeURIComponent(parts[1]));
  if (parts[0] === "lernen") return viewLearn(q);
  if (parts[0] === "eigene") return viewOwn(q);
  if (parts[0] === "konto") return viewAccount();
  return viewHome();
}
window.addEventListener("hashchange", route);

/* ---------- Übersicht ---------- */
function viewHome() {
  setNav("home");
  const decks = allDecks();
  const all = decks.flatMap((d) => cardsOf(d.id));
  const s = deckStats(all);
  const bySem = new Map();
  for (const d of decks) { if (!bySem.has(d.semester)) bySem.set(d.semester, []); bySem.get(d.semester).push(d); }
  const current = Math.max(...decks.map((d) => d.semester));

  let html = `
  <section class="hero">
    <div>
      <h1>Hallo Max</h1>
      <p class="muted">${s.due ? `${s.due} Karten sind heute fällig.` : "Heute ist nichts fällig."} ${s.new} Karten hast du noch nie gesehen.</p>
    </div>
    <div class="btn-row">
      <a class="btn primary" href="#/lernen?deck=all&mode=faellig"${s.due + s.new ? "" : " aria-disabled"}>Fällige lernen</a>
    </div>
  </section>
  <div class="stats">
    <div class="stat"><b>${s.total}</b><span>Karten gesamt</span></div>
    <div class="stat"><b>${s.known}</b><span>sitzen (≥ 7 Tage)</span></div>
    <div class="stat"><b>${s.learning}</b><span>in Arbeit</span></div>
    <div class="stat"><b>${streak()}</b><span>Tage in Folge gelernt</span></div>
  </div>`;

  for (const sem of [...bySem.keys()].sort((a, b) => b - a)) {
    const list = bySem.get(sem);
    const semCards = list.flatMap((d) => cardsOf(d.id));
    const ss = deckStats(semCards);
    html += `<div class="sem"><h2>Semester ${romans[sem] || sem}${sem === current ? " · aktuell" : ""}</h2>
      <a class="small" href="#/lernen?deck=sem-${sem}&mode=faellig">${ss.due ? `${ss.due} fällig · ` : ""}Semester lernen</a></div><div class="grid">`;
    for (const d of list) {
      const st = deckStats(cardsOf(d.id));
      html += `<a class="deck" href="#/fach/${encodeURIComponent(d.id)}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
          <h3>${esc(d.fach)}</h3>${st.due ? `<span class="pill due">${st.due} fällig</span>` : ""}
        </div>
        ${bar(st)}
        <div class="meta"><span>${st.total} Karten</span><span>${st.total ? Math.round((st.known / st.total) * 100) : 0} % sitzen</span></div>
      </a>`;
    }
    html += `</div>`;
  }
  html += `<div class="legend" style="margin-top:20px"><span class="l-known">sitzt</span><span class="l-learning">in Arbeit</span><span class="l-new">neu</span></div>`;
  $app.innerHTML = html;
}

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
function viewDeck(id) {
  setNav("home");
  const d = deckById(id);
  if (!d) { $app.innerHTML = `<p class="pad">Fach nicht gefunden. <a href="#/">Zur Übersicht</a></p>`; return; }
  const cards = cardsOf(id);
  const st = deckStats(cards);
  const topics = [...new Set(cards.map((c) => c.topic || "Allgemein"))];
  const exam = cards.filter((c) => c.exam).length;
  const weak = cards.filter((c) => { const p = state.progress[c.id]; return p && (p.lapses > 0 || p.ease < 2.2); }).length;
  let topic = "";
  const link = (mode) => `#/lernen?deck=${encodeURIComponent(id)}&mode=${mode}${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`;

  $app.innerHTML = `
    <a class="back" href="#/">← Übersicht</a>
    <div class="hero" style="margin-bottom:8px"><div>
      <p class="faint small" style="margin:0 0 4px">Semester ${romans[d.semester] || d.semester}</p>
      <h1>${esc(d.fach)}</h1>
      <p class="muted">${st.total} Karten · ${st.known} sitzen · ${st.learning} in Arbeit · ${st.new} neu</p>
    </div></div>
    ${bar(st)}
    <div class="modes" id="modes"></div>
    <h2>Themen</h2>
    <div class="topics" id="topics">
      <button class="chip on" data-t="">Alle</button>
      ${topics.map((t) => `<button class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join("")}
    </div>
    <input class="search" id="search" type="search" placeholder="Karten durchsuchen …" aria-label="Karten durchsuchen">
    <ul class="list" id="list"></ul>
    <p class="small faint" style="margin-top:16px"><a href="#/eigene?deck=${encodeURIComponent(id)}">+ Eigene Karte zu diesem Fach</a></p>`;

  const renderModes = () => {
    const pool = topic ? cards.filter((c) => (c.topic || "Allgemein") === topic) : cards;
    const s2 = deckStats(pool);
    const ex = pool.filter((c) => c.exam).length;
    const wk = pool.filter((c) => { const p = state.progress[c.id]; return p && (p.lapses > 0 || p.ease < 2.2); }).length;
    document.getElementById("modes").innerHTML = `
      <a class="mode primary" href="${link("faellig")}" ${s2.due + s2.new ? "" : "disabled"}><b>Fällige lernen</b><span>${s2.due} fällig · bis zu ${Math.min(NEW_PER_SESSION, s2.new)} neue</span></a>
      <a class="mode" href="${link("alle")}"><b>Alle durchgehen</b><span>${pool.length} Karten, gemischt</span></a>
      <a class="mode" href="${link("pruefung")}" ${ex ? "" : "disabled"}><b>Prüfungsrelevant</b><span>${ex ? `${ex} markierte Karten` : "keine markiert"}</span></a>
      <a class="mode" href="${link("schwach")}" ${wk ? "" : "disabled"}><b>Schwachstellen</b><span>${wk ? `${wk} Karten, die hakten` : "noch keine"}</span></a>`;
  };
  const renderList = () => {
    const term = document.getElementById("search").value.trim().toLowerCase();
    const items = cards.filter((c) => (!topic || (c.topic || "Allgemein") === topic) && (!term || (c.q + " " + c.a).toLowerCase().includes(term)));
    document.getElementById("list").innerHTML = items.slice(0, 300).map((c) => {
      const p = state.progress[c.id]; const s = statusOf(c);
      const tag = s === "new" ? `<span class="pill">neu</span>` : s === "known" ? `<span class="pill own">sitzt</span>` : `<span class="pill exam">in Arbeit</span>`;
      return `<li><details><summary><span>${esc(c.q)}</span>${tag}</summary>
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
  setNav("home");
  const deckParam = q.get("deck") || "all";
  const mode = q.get("mode") || "faellig";
  const topic = q.get("topic") || "";
  let pool, title, backHref;
  if (deckParam === "all") { pool = allDecks().flatMap((d) => cardsOf(d.id)); title = "Alle Fächer"; backHref = "#/"; }
  else if (deckParam.startsWith("sem-")) {
    const sem = Number(deckParam.slice(4));
    pool = allDecks().filter((d) => d.semester === sem).flatMap((d) => cardsOf(d.id));
    title = `Semester ${romans[sem] || sem}`; backHref = "#/";
  } else {
    const d = deckById(deckParam); pool = cardsOf(deckParam); title = d ? d.fach : "Fach"; backHref = `#/fach/${encodeURIComponent(deckParam)}`;
  }
  if (topic) { pool = pool.filter((c) => (c.topic || "Allgemein") === topic); title += ` · ${topic}`; }

  let queue;
  if (mode === "alle") queue = shuffle(pool);
  else if (mode === "pruefung") queue = shuffle(pool.filter((c) => c.exam));
  else if (mode === "schwach") queue = shuffle(pool.filter((c) => { const p = state.progress[c.id]; return p && (p.lapses > 0 || p.ease < 2.2); }));
  else {
    const due = pool.filter((c) => isDue(c, Date.now())).sort((a, b) => state.progress[a.id].due - state.progress[b.id].due);
    const semOf = (c) => deckById(c.deckId)?.semester || 0;
    const fresh = pool.filter((c) => !state.progress[c.id]).sort((a, b) => semOf(b) - semOf(a)).slice(0, NEW_PER_SESSION);
    queue = [...shuffle(due), ...fresh];
  }

  const total = queue.length;
  let done = 0, shown = false, counts = { 1: 0, 2: 0, 3: 0, 4: 0 };

  const render = () => {
    if (!queue.length) {
      if (keyHandler) document.removeEventListener("keydown", keyHandler);
      $app.innerHTML = `<div class="learn"><div class="done">
        <div class="big">${total ? "✓" : "☕"}</div>
        <h1>${total ? "Runde geschafft" : "Hier gibt es gerade nichts zu lernen"}</h1>
        <p class="muted">${total ? `${total} Karten · ${counts[1]}× nochmal, ${counts[2]}× schwer, ${counts[3]}× gut, ${counts[4]}× leicht` : "Keine Karten fällig. Probier „Alle durchgehen“ oder ein anderes Fach."}</p>
        <div class="btn-row" style="justify-content:center;margin-top:20px">
          <a class="btn" href="${backHref}">Zurück</a>
          ${mode !== "alle" ? `<a class="btn" href="#/lernen?deck=${encodeURIComponent(deckParam)}&mode=alle${topic ? `&topic=${encodeURIComponent(topic)}` : ""}">Alle durchgehen</a>` : ""}
        </div></div></div>`;
      return;
    }
    const c = queue[0];
    const d = deckById(c.deckId);
    $app.innerHTML = `<div class="learn">
      <div class="learn-top">
        <a class="back" style="margin:0" href="${backHref}">← ${esc(title)}</a>
        <span class="small faint">${done} / ${total}</span>
      </div>
      <div class="progress"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
      <div style="height:14px"></div>
      <article class="card" id="card" aria-live="polite">
        <div class="tag">
          ${d && deckParam !== d.id ? `<span class="pill">${esc(d.kurz || d.fach)}</span>` : ""}
          <span class="pill">${esc(c.topic || "Allgemein")}</span>
          ${c.exam ? `<span class="pill exam">prüfungsrelevant</span>` : ""}
          ${c.own ? `<span class="pill own">eigene</span>` : ""}${c.shared ? `<span class="pill own">geteilt</span>` : ""}
          ${!state.progress[c.id] ? `<span class="pill due">neu</span>` : ""}
        </div>
        <div class="q">${esc(c.q)}</div>
        ${shown ? `<div class="a">${esc(c.a)}</div>` : `<div class="hint">Tippen zum Aufdecken</div>`}
      </article>
      ${shown ? `<div class="rate">
          <button class="r1" data-r="1"><b>Nochmal</b><span>${preview(c, 1)}</span></button>
          <button class="r2" data-r="2"><b>Schwer</b><span>${preview(c, 2)}</span></button>
          <button class="r3" data-r="3"><b>Gut</b><span>${preview(c, 3)}</span></button>
          <button class="r4" data-r="4"><b>Leicht</b><span>${preview(c, 4)}</span></button>
        </div>` : `<button class="btn primary reveal" id="reveal">Antwort zeigen</button>`}
      <p class="keys">Tastatur: <kbd>Leertaste</kbd> aufdecken · <kbd>1</kbd>–<kbd>4</kbd> bewerten</p>
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
    <h1>Eigene Karten</h1>
    <p class="muted">Deine Karten landen im gewählten Fach und werden dort mitgelernt.${state.syncOn ? " Mit „für alle teilen“ sehen sie auch deine Freunde." : ""}</p>

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
      JSON.stringify({ version: 1, progress: state.progress, own: state.own, customDecks: state.customDecks, days: store.get("days", []) }, null, 1), "application/json");
  };
  document.getElementById("imp-backup").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      mergeProgress(data.progress || {});
      for (const c of data.own || []) { const i = state.own.findIndex((x) => x.id === c.id); if (i < 0) state.own.push(c); else if ((c.upd || 0) > (state.own[i].upd || 0)) state.own[i] = c; }
      for (const d of data.customDecks || []) if (!state.customDecks.some((x) => x.id === d.id)) state.customDecks.push(d);
      store.set("days", [...new Set([...store.get("days", []), ...(data.days || [])])]);
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
    $app.innerHTML = `<h1>Konto</h1>
      <div class="section note">Die App läuft gerade <b>nur lokal</b>: Dein Lernstand liegt in diesem Browser. Auf dem iPhone und am Mac ist er deshalb getrennt.
      Sobald Supabase eingerichtet ist (Werte in <code>config.js</code>), kannst du dich hier anmelden, und alles wird geräteübergreifend gespeichert.</div>
      <div class="section"><h2 style="margin-bottom:10px">Lernstand</h2>
      <p class="muted">Zum Sichern: <a href="#/eigene">Eigene Karten → Backup herunterladen</a>.</p>
      <button class="btn danger" id="reset">Lernstand zurücksetzen</button></div>
      <p class="small faint"><a href="datenschutz.html">Datenschutz</a></p>`;
  } else if (!state.user) {
    $app.innerHTML = `<h1>Anmelden</h1>
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
    $app.innerHTML = `<h1>Konto</h1>
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
