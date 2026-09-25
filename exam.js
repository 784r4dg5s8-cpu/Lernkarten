// Probeklausuren: Zusammenstellung nach dem Klausuraufbau der Dozierenden, Timer, Abgabe, Bewertung.
import { GENERATORS, fmt } from "./stats.js?v=202609250957";

let C; // Kontext aus app.js: { $app, esc, icon, store, toast, setNav, deckById }
export function initExam(ctx) { C = ctx; }

/* ---------- Klausuraufbau je Fach ---------- */
// min/pts = volle Klausur. proVL = Punkte je bisher behandelter Vorlesung (laufendes Semester).
const BP = {
  "s1-einfuhrung-in-die-psychologie": { min: 120, pts: 120, parts: [
    { label: "Teil A · Forschungsmethodik", pts: 60, filter: (a) => /^Forschungsmethodik/.test(a.thema) },
    { label: "Teil B · Psychologie & ihre Geschichte", pts: 60, filter: (a) => /^Geschichte/.test(a.thema) }] },
  "s1-allgemeine-psychologie-i": { min: 120, pts: 120, geschaetzt: true },
  "s1-biologische-psychologie": { min: 120, pts: 120, geschaetzt: true },
  "s1-deskriptive-statistik-wahrscheinlichkeit": { min: 75, pts: 75, geschaetzt: true, gen: 3, parts: [{ label: "Teil B · Verständnisfragen", pts: 31, filter: () => true }] },
  "s2-allgemeine-psychologie-ii": { min: 120, pts: 120 },
  "s2-sozialpsychologie": { min: 120, pts: 120 },
  "s2-inferenzstatistik": { min: 90, gen: 4 },
  "s3-einfuhrung-in-die-klinische-psychologie-und-psychotherapie": { min: 30, pts: 30, hinweis: "Probeklausur für den Anteil von Frau Gehrig (30 von 90 Punkten).", parts: [
    { label: "Teil A · Offene Fragen", pts: 10, filter: (a) => a.typ === "offen" },
    { label: "Teil B · Multiple Choice", pts: 10, filter: (a) => a.typ === "mc" },
    { label: "Teil C · Fallvignette", pts: 10, filter: (a) => a.typ === "fall" }] },
  "s3-grundlagen-der-testtheorie-und-psychologischen-diagnostik": { min: 120, pts: 120, proVL: 15 },
  "s3-personlichkeits-und-differentielle-psychologie": { min: 120, pts: 120, proVL: 15 },
};
export const hasExam = (d) => !!BP[d.id] && (d.exam || !!GENERATORS[d.id]) && d.pruefung === "Klausur";

/* ---------- Notenschlüssel ---------- */
const KEY = [[95, "1,0"], [90, "1,3"], [85, "1,7"], [80, "2,0"], [75, "2,3"], [70, "2,7"], [65, "3,0"], [60, "3,3"], [55, "3,7"], [50, "4,0"]];
export const note = (p) => (KEY.find(([t]) => p >= t) || [0, "5,0"])[1];

/* ---------- Hilfen ---------- */
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = (s) => String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9₀-₉²ŷμρ=<>+≠ ]+/g, " ").replace(/\s+/g, " ");
const hit = (answer, words) => { const a = " " + norm(answer) + " "; return words.some((w) => { const n = norm(w).trim(); return n && a.includes(n.length <= 3 ? " " + n : n); }); };
const num = (s) => { if (s == null) return NaN; const t = String(s).trim().replace(/\s/g, "").replace(",", "."); return t === "" ? NaN : Number(t); };
const tolOf = (f) => (f.tol !== undefined ? f.tol : Math.max(0.011, Math.abs(f.wert) * (f.rel ?? 0.01)));
const half = (x) => Math.round(x * 2) / 2;
const store = () => C.store;
const histKey = (id) => "examHist:" + id, curKey = (id) => "exam:" + id;

async function loadPool(id) {
  try { const r = await fetch(`exams/${id}.json?v=${window.LK_VERSION || 1}`, { cache: "no-cache" }); if (!r.ok) return []; return (await r.json()).aufgaben || []; }
  catch { return []; }
}

// zieht Aufgaben bis ~target Punkte: verteilt über Vorlesungen, bevorzugt zuletzt nicht gezogene, mischt Stufen
function pickTasks(pool, target, recent) {
  const fresh = shuffle(pool.filter((a) => !recent.has(a.id))), old = shuffle(pool.filter((a) => recent.has(a.id)));
  const cand = [...fresh, ...old];
  const vls = [...new Set(pool.map((a) => a.vl))];
  const budget = target / Math.max(1, vls.length);
  const share = { wissen: 0.4, anwendung: 0.35, analyse: 0.25 };
  const spentVL = {}, spentSt = {}, chosen = [];
  let total = 0, progress = true;
  while (progress && total < target) {
    progress = false;
    for (const vl of shuffle(vls)) {
      const i = cand.findIndex((a) => a.vl === vl && a.punkte <= target - total && (spentVL[vl] || 0) + a.punkte <= budget + 3 &&
        (!a.stufe || (spentSt[a.stufe] || 0) + a.punkte <= target * (share[a.stufe] || 1) + 4));
      if (i < 0) continue;
      const a = cand.splice(i, 1)[0];
      chosen.push(a); total += a.punkte; spentVL[vl] = (spentVL[vl] || 0) + a.punkte; spentSt[a.stufe] = (spentSt[a.stufe] || 0) + a.punkte; progress = true;
      if (total >= target) break;
    }
  }
  for (const a of [...cand]) { if (total >= target - 0.5) break; if (a.punkte <= target - total) { chosen.push(a); total += a.punkte; } }
  return chosen.sort((a, b) => a.vl - b.vl);
}

async function buildExam(d) {
  const bp = BP[d.id];
  const hist = store().get(histKey(d.id), []);
  const recent = new Set(hist.slice(-2).flatMap((h) => h.ids || []));
  const pool = d.exam ? await loadPool(d.id) : [];
  const sections = [];
  if (bp.gen) {
    const gens = shuffle(GENERATORS[d.id]).slice(0, bp.gen);
    sections.push({ label: bp.parts ? "Teil A · Rechenaufgaben" : "", tasks: gens.map((g, i) => ({ id: "gen-" + i + "-" + Date.now(), ...g() })) });
  }
  let pts = bp.pts, min = bp.min;
  if (bp.proVL) {
    const nVL = new Set(pool.map((a) => a.vl)).size;
    pts = Math.min(bp.pts, bp.proVL * nVL); min = Math.round(bp.min * pts / bp.pts);
  }
  if (bp.parts) for (const p of bp.parts) sections.push({ label: p.label, tasks: pickTasks(pool.filter(p.filter), p.pts, recent) });
  else if (!bp.gen) sections.push({ label: "", tasks: pickTasks(pool, pts, recent) });
  // MC-Optionen mischen
  for (const s of sections) s.tasks = s.tasks.map((t) => t.typ === "mc" ? { ...t, order: shuffle(t.optionen.map((_, i) => i)) } : t);
  const total = sections.reduce((a, s) => a + s.tasks.reduce((b, t) => b + t.punkte, 0), 0);
  if (bp.gen) min = bp.min * (bp.pts ? total / bp.pts : 1);
  return { deck: d.id, created: Date.now(), minutes: Math.round(bp.gen && !bp.pts ? bp.min : min), punkte: total, sections, answers: {}, submitted: false, grade: {} };
}

/* ---------- Übersicht aller Probeklausuren ---------- */
export function viewExams() {
  C.setNav("klausuren");
  const decks = C.allDecks().filter(hasExam);
  const act = decks.filter((d) => C.isActive(d.id)), rest = decks.filter((d) => !C.isActive(d.id));
  const row = (d) => {
    const bp = BP[d.id], h = C.store.get(histKey(d.id), []), last = h[h.length - 1];
    const run = C.store.get(curKey(d.id), null);
    return `<div class="exam-row" style="--hue:${C.hueOf(d.id)}">
      <div class="er-main"><b>${C.esc(d.fach)}</b><span>${C.esc(d.format || "")}${bp.geschaetzt ? " · Format geschätzt" : ""}</span></div>
      ${last ? `<div class="er-last"><b>${last.note}</b><span>zuletzt</span></div>` : ""}
      <button class="btn ${run && !run.submitted ? "" : "primary"}" data-start="${C.esc(d.id)}">${C.icon("play")} ${run && !run.submitted ? "Fortsetzen" : "Starten"}</button>
    </div>`;
  };
  C.$app.innerHTML = `
    <div class="eyebrow">Prüfungssimulation</div>
    <h1 style="margin-top:10px">Probeklausuren</h1>
    <p class="muted" style="margin-top:12px;max-width:44em">Aufgebaut wie die echte Klausur des Fachs – mit Zeitlimit, Punkten pro Aufgabe, Musterlösung und Note. Jede Probeklausur wird neu zusammengestellt.</p>
    ${act.length ? `<div class="sec-head"><div><span class="eyebrow dim">Deine Fächer</span><h2>Aktuell</h2></div></div><div class="exam-list">${act.map(row).join("")}</div>` : ""}
    ${rest.length ? `<div class="sec-head"><div><span class="eyebrow dim">Weitere Fächer</span><h2>Archiv</h2></div></div><div class="exam-list">${rest.map(row).join("")}</div>` : ""}`;
  C.$app.querySelectorAll("[data-start]").forEach((b) => (b.onclick = async () => {
    const d = C.deckById(b.dataset.start); const run = C.store.get(curKey(d.id), null);
    if (!(run && !run.submitted)) { b.disabled = true; C.store.set(curKey(d.id), await buildExam(d)); }
    location.hash = `#/klausur/${encodeURIComponent(d.id)}`;
  }));
}

/* ---------- Fach-Seite: Abschnitt Probeklausur ---------- */
export function examPanel(d) {
  const bp = BP[d.id];
  const hist = store().get(histKey(d.id), []);
  const running = store().get(curKey(d.id), null);
  let body;
  if (d.pruefung === "Hausarbeit") body = `<p class="muted">Dieses Modul wird mit einer Hausarbeit abgeschlossen – deshalb gibt es keine Probeklausur und keine „prüfungsrelevant“-Markierung.</p>`;
  else if (!hasExam(d)) body = `<p class="muted">${d.pruefung === "unbekannt" ? "Die Prüfungsform ist noch nicht bekannt." : "Für dieses Fach gibt es noch keinen Aufgabenpool."} Sobald Folien und Klausurinfos da sind, kommt die Probeklausur dazu.</p>`;
  else {
    const full = bp.proVL ? `<p class="small muted" style="margin-top:6px">Semester läuft noch: Die Probeklausur umfasst nur die bisherigen Vorlesungen (${bp.proVL} Punkte je Vorlesung) und wächst mit jeder neuen VL.</p>` : "";
    body = `
      ${bp.hinweis ? `<p class="small muted">${C.esc(bp.hinweis)}</p>` : ""}${full}
      <div class="btn-row" style="margin-top:14px">
        ${running && !running.submitted ? `<a class="btn primary" href="#/klausur/${encodeURIComponent(d.id)}">${C.icon("play")} Laufende Probeklausur fortsetzen</a><button class="btn" id="exam-new">Neue starten</button>`
          : `<button class="btn primary" id="exam-new">${C.icon("play")} Probeklausur starten</button>`}
      </div>
      <p class="small faint" style="margin-top:10px">Jede Probeklausur wird neu gezogen${GENERATORS[d.id] ? " – Rechenaufgaben mit neuen Zufallsdaten" : ""}. Am Ende gibt es Musterlösung, Bewertung nach Erwartungshorizont und eine Note.</p>
      ${hist.length ? `<div class="exam-hist">${hist.slice(-5).reverse().map((h) => `<div><b>${h.note}</b><span>${fmt(h.pts, 1)} / ${h.max} P · ${new Date(h.date).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}</span></div>`).join("")}</div>` : ""}`;
  }
  return `<section class="panel exam-panel section">
    <div class="exam-head"><span class="m-ic">${C.icon("pen")}</span><div><div class="eyebrow">Prüfung</div><h2>${d.pruefung === "Klausur" ? "Probeklausur" : d.pruefung === "Hausarbeit" ? "Hausarbeit" : "Prüfungsform offen"}</h2></div></div>
    <p style="margin-top:12px"><b>${C.esc(d.format || "Prüfungsform unbekannt")}</b>${bp?.geschaetzt ? ` <span class="pill due">Format geschätzt</span>` : ""}</p>
    ${body}</section>`;
}
export function bindExamPanel(d) {
  const b = document.getElementById("exam-new");
  if (!b) return;
  b.onclick = async () => {
    const run = C.store.get(curKey(d.id), null);
    if (run && !run.submitted && !confirm("Die laufende Probeklausur verwerfen und eine neue starten?")) return;
    b.disabled = true; b.textContent = "Wird zusammengestellt …";
    const ex = await buildExam(d);
    C.store.set(curKey(d.id), ex);
    location.hash = `#/klausur/${encodeURIComponent(d.id)}`;
  };
}

/* ---------- Klausur schreiben ---------- */
let timer = null;
export function viewExam(id) {
  const d = C.deckById(id);
  const ex = C.store.get(curKey(id), null);
  if (!d || !ex) { location.hash = `#/fach/${encodeURIComponent(id)}`; return; }
  if (ex.submitted) return viewResult(id);
  C.setNav("learn");
  if (!ex.started) { ex.started = Date.now(); C.store.set(curKey(id), ex); }
  let n = 0;
  const html = ex.sections.map((s) => `${s.label ? `<h2 class="exam-part">${C.esc(s.label)}</h2>` : ""}${s.tasks.map((t) => taskForm(t, ++n, ex.answers)).join("")}`).join("");
  C.$app.innerHTML = `<div class="exam">
    <div class="exam-bar">
      <a class="icon-btn" href="#/fach/${encodeURIComponent(id)}" aria-label="Zurück" title="Zwischenspeichern und zurück">${C.icon("back")}</a>
      <div class="exam-title"><b>Probeklausur · ${C.esc(d.kurz || d.fach)}</b><span>${ex.punkte} Punkte · ${ex.minutes} Minuten</span></div>
      <span class="timer" id="timer"></span>
      <button class="btn primary" id="submit">Abgeben</button>
    </div>
    <div class="note" style="margin:16px 0 4px">${C.icon("info")}<div>Schreib wie in der echten Klausur: ohne Folien, in ganzen Sätzen oder Stichpunkten. Deine Antworten werden automatisch gespeichert. ${ex.sections.some((s) => s.tasks.some((t) => t.typ === "rechnen")) ? "Zahlen mit Komma oder Punkt, auf zwei Nachkommastellen gerundet." : ""}</div></div>
    <form id="exam-form" autocomplete="off">${html}</form>
    <div class="btn-row" style="justify-content:center;margin:26px 0 10px"><button class="btn primary big" id="submit2" type="button">Klausur abgeben</button></div>
  </div>`;
  const form = document.getElementById("exam-form");
  let saveT;
  form.addEventListener("input", (e) => {
    const el = e.target; if (!el.name) return;
    if (el.type === "checkbox") { const all = [...form.querySelectorAll(`input[name="${CSS.escape(el.name)}"]:checked`)].map((x) => Number(x.value)); ex.answers[el.name] = all; }
    else if (el.type === "radio") ex.answers[el.name] = Number(el.value);
    else ex.answers[el.name] = el.value;
    clearTimeout(saveT); saveT = setTimeout(() => C.store.set(curKey(id), ex), 300);
  });
  const submit = () => {
    const open = countOpen(ex);
    if (!confirm(open ? `Noch ${open} Antwortfelder sind leer. Trotzdem abgeben?` : "Klausur jetzt abgeben?")) return;
    ex.submitted = true; ex.finished = Date.now(); autoGrade(ex); C.store.set(curKey(id), ex);
    saveHistory(d, ex); clearInterval(timer); viewResult(id); window.scrollTo(0, 0);
  };
  document.getElementById("submit").onclick = submit; document.getElementById("submit2").onclick = submit;
  const tick = () => {
    const el = document.getElementById("timer"); if (!el) { clearInterval(timer); return; }
    const left = ex.started + ex.minutes * 60e3 - Date.now(), neg = left < 0, a = Math.abs(left);
    const mm = Math.floor(a / 60e3), ss = Math.floor((a % 60e3) / 1e3);
    el.textContent = `${neg ? "+" : ""}${mm}:${String(ss).padStart(2, "0")}`;
    el.className = "timer" + (neg ? " over" : left < 10 * 60e3 ? " low" : "");
    el.title = neg ? "Zeit überschritten" : "verbleibende Zeit";
  };
  clearInterval(timer); timer = setInterval(tick, 1000); tick();
}

function countOpen(ex) {
  let n = 0;
  for (const s of ex.sections) for (const t of s.tasks) for (const k of keysOf(t)) { const v = ex.answers[k]; if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) n++; }
  return n;
}
function keysOf(t) {
  if (t.typ === "offen" || t.typ === "mc") return [t.id];
  if (t.typ === "fall") return t.teile.map((_, i) => `${t.id}#${i}`);
  return t.teile.flatMap((p, i) => p.art === "zahl" ? p.felder.map((_, j) => `${t.id}#${i}#${j}`) : [`${t.id}#${i}`]);
}

const ta = (name, val, rows = 5) => `<textarea name="${name}" rows="${rows}" placeholder="Deine Antwort …">${C.esc(val || "")}</textarea>`;
function taskHead(t, n, title) {
  return `<div class="task-head"><span class="task-no">Aufgabe ${n}</span>${title ? `<span class="task-topic">${C.esc(title)}</span>` : ""}<span class="task-pts">${fmt(t.punkte, 1)} ${t.punkte === 1 ? "Punkt" : "Punkte"}</span></div>`;
}
function taskForm(t, n, A) {
  if (t.typ === "offen") return `<article class="task">${taskHead(t, n)}<p class="task-q">${C.esc(t.frage)}</p>${ta(t.id, A[t.id], Math.min(10, 3 + Math.round(t.punkte / 2)))}</article>`;
  if (t.typ === "mc") {
    const sel = A[t.id] || [];
    return `<article class="task">${taskHead(t, n)}<p class="task-q">${C.esc(t.frage)}</p><p class="small muted">${t.modus === "multi" ? "Mehrere Antworten können richtig sein." : "Genau eine Antwort ist richtig."}</p>
      <div class="mc">${t.order.map((i) => `<label class="mc-opt"><input type="${t.modus === "multi" ? "checkbox" : "radio"}" name="${t.id}" value="${i}" ${[].concat(sel).includes(i) ? "checked" : ""}><span>${C.esc(t.optionen[i])}</span></label>`).join("")}</div></article>`;
  }
  if (t.typ === "fall") return `<article class="task">${taskHead(t, n, "Fallvignette")}<div class="material">${C.esc(t.material)}</div>
    ${t.teile.map((p, i) => `<div class="sub"><div class="sub-head"><span>${C.esc(p.frage)}</span><span class="task-pts">${fmt(p.punkte, 1)} P</span></div>${ta(`${t.id}#${i}`, A[`${t.id}#${i}`], 4)}</div>`).join("")}</article>`;
  // Rechenaufgabe
  return `<article class="task">${taskHead(t, n, t.thema)}<div class="material">${C.esc(t.material)}</div>
    ${t.tabelle ? tableHtml(t.tabelle) : ""}${t.gegeben ? `<p class="given">Gegeben: ${C.esc(t.gegeben)}</p>` : ""}
    ${t.teile.map((p, i) => `<div class="sub"><div class="sub-head"><span>${String.fromCharCode(97 + i)}) ${C.esc(p.frage)}</span><span class="task-pts">${fmt(p.punkte, 1)} P</span></div>${partInput(t, p, i, A)}</div>`).join("")}</article>`;
}
function partInput(t, p, i, A) {
  const k = `${t.id}#${i}`;
  if (p.art === "zahl") return `<div class="num-grid">${p.felder.map((f, j) => `<label>${C.esc(f.label)}<input inputmode="decimal" name="${k}#${j}" value="${C.esc(A[`${k}#${j}`] || "")}"></label>`).join("")}</div>`;
  if (p.art === "wahl") return `<div class="mc">${p.optionen.map((o, j) => `<label class="mc-opt"><input type="radio" name="${k}" value="${j}" ${A[k] === j ? "checked" : ""}><span>${C.esc(o)}</span></label>`).join("")}</div>${/Begründen/.test(p.frage) ? ta(k + "#b", A[k + "#b"], 2) : ""}`;
  return ta(k, A[k], 3);
}
function tableHtml(tb) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${tb.kopf.map((h) => `<th>${C.esc(h)}</th>`).join("")}</tr></thead><tbody>${tb.zeilen.map((r) => `<tr>${r.map((c) => `<td>${C.esc(typeof c === "number" ? fmt(c, Number.isInteger(c) ? 0 : 2) : c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/* ---------- Bewertung ---------- */
// grade[key] = { items: [{label, pts, ok, auto}] } – ok true/false, auto = automatisch erkannt
function autoGrade(ex) {
  const G = {}; const A = ex.answers;
  const crit = (key, ans, kriterien) => { G[key] = { items: kriterien.filter((c) => c.punkte > 0).map((c) => ({ label: c.text, pts: c.punkte, ok: c.stichworte && c.stichworte.length ? hit(ans, c.stichworte) && String(ans || "").trim().length > 3 : false, auto: !!(c.stichworte && c.stichworte.length) })) }; };
  for (const s of ex.sections) for (const t of s.tasks) {
    if (t.typ === "offen") crit(t.id, A[t.id], t.kriterien);
    else if (t.typ === "fall") t.teile.forEach((p, i) => crit(`${t.id}#${i}`, A[`${t.id}#${i}`], p.kriterien));
    else if (t.typ === "mc") { const sel = [].concat(A[t.id] ?? []).sort().join(","); G[t.id] = { items: [{ label: "Richtige Auswahl", pts: t.punkte, ok: sel === [...t.richtig].sort().join(","), auto: true, fixed: true }] }; }
    else t.teile.forEach((p, i) => {
      const k = `${t.id}#${i}`;
      if (p.art === "zahl") { const each = p.punkte / p.felder.length; G[k] = { items: p.felder.map((f, j) => { const v = num(A[`${k}#${j}`]); return { label: `${f.label} = ${fmt(f.wert, f.tol === 0 ? 0 : 2)}`, pts: each, ok: isFinite(v) && Math.abs(v - f.wert) <= tolOf(f), auto: true }; }) }; }
      else if (p.art === "wahl") { const begr = /Begründen/.test(p.frage); const ok = A[k] === p.richtig; G[k] = { items: begr ? [{ label: `Auswahl: ${p.optionen[p.richtig]}`, pts: p.punkte / 2, ok, auto: true }, { label: "Begründung stimmt", pts: p.punkte / 2, ok: false, auto: false }] : [{ label: p.optionen[p.richtig], pts: p.punkte, ok, auto: true }] }; }
      else crit(k, A[k], p.kriterien);
    });
  }
  ex.grade = G;
}
const scoreOf = (ex) => { let got = 0, max = 0; for (const g of Object.values(ex.grade)) for (const it of g.items) { max += it.pts; if (it.ok) got += it.pts; } return { got: half(got), max: half(max) }; };
function saveHistory(d, ex) {
  const { got, max } = scoreOf(ex);
  const h = C.store.get(histKey(d.id), []);
  const ids = ex.sections.flatMap((s) => s.tasks.map((t) => t.id));
  const entry = { date: ex.finished, pts: got, max, note: note(max ? (got / max) * 100 : 0), ids };
  const i = h.findIndex((x) => x.date === ex.finished); if (i >= 0) h[i] = entry; else h.push(entry);
  C.store.set(histKey(d.id), h.slice(-10));
}

function viewResult(id) {
  const d = C.deckById(id); const ex = C.store.get(curKey(id), null);
  C.setNav("learn");
  const render = () => {
    const { got, max } = scoreOf(ex); const p = max ? (got / max) * 100 : 0; const nt = note(p);
    const byTopic = {};
    for (const s of ex.sections) for (const t of s.tasks) {
      const key = t.thema || s.label || "Allgemein"; const tp = (byTopic[key] ||= { got: 0, max: 0 });
      for (const k of keysOf(t).map((x) => x.split("#").slice(0, 2).join("#")).filter((v, i, a) => a.indexOf(v) === i)) {
        const g = ex.grade[k] || ex.grade[k.split("#")[0]]; if (!g) continue;
        for (const it of g.items) { tp.max += it.pts; if (it.ok) tp.got += it.pts; }
      }
    }
    const used = ex.finished && ex.started ? Math.round((ex.finished - ex.started) / 60e3) : null;
    let n = 0;
    C.$app.innerHTML = `<div class="exam">
      <a class="back" href="#/fach/${encodeURIComponent(id)}">${C.icon("back")} ${C.esc(d.fach)}</a>
      <section class="hero result-hero">
        <div class="hero-main">
          <div class="eyebrow">Probeklausur ausgewertet</div>
          <h1>${p >= 50 ? `<span class="mark">Bestanden</span> mit ${nt}` : `Noch <span class="mark">nicht bestanden</span>`}</h1>
          <p class="hero-sub">${fmt(got, 1)} von ${fmt(max, 1)} Punkten (${Math.round(p)} %)${used !== null ? ` · ${used} von ${ex.minutes} Minuten` : ""}. Zum Bestehen sind 50 % nötig.</p>
          <div class="note" style="margin-top:4px">${C.icon("info")}<div><b>So wird bewertet:</b> wie mit einem Erwartungshorizont. Rechenwerte, Multiple Choice und Auswahlfragen prüft die App exakt. Bei offenen Antworten hakt sie die Kernpunkte vorläufig über Fachbegriffe ab. Prüfe jeden Punkt mit der Musterlösung und klick ihn an, wenn du ihn anders bewertest. Punkte ohne Automatik (Beispiele, Begründungen, Folgefehler) bewertest du selbst.</div></div>
        </div>
        <div class="hero-side">${ringPct(p, nt)}</div>
      </section>
      <div class="sec-head"><div><span class="eyebrow dim">Stärken & Lücken</span><h2>Nach Themen</h2></div></div>
      <div class="topic-bars">${Object.entries(byTopic).map(([k, v]) => { const q = v.max ? v.got / v.max : 0; const vl = k.match(/^VL \d+ · .*/) ? k : null;
        return `<div class="tb"><div class="tb-top"><span>${C.esc(k)}</span><b>${fmt(v.got, 1)}/${fmt(v.max, 1)}</b></div><div class="bar"><i class="${q >= 0.5 ? "b-known" : "b-learning"}" style="width:${q * 100}%"></i></div>${q < 0.6 && vl ? `<a class="small" href="#/lernen?deck=${encodeURIComponent(id)}&mode=alle&topic=${encodeURIComponent(vl)}">Karten zu diesem Thema lernen →</a>` : ""}</div>`; }).join("")}</div>
      <div class="sec-head"><div><span class="eyebrow dim">Korrektur</span><h2>Deine Antworten & Musterlösung</h2></div></div>
      ${ex.sections.map((s) => `${s.label ? `<h2 class="exam-part">${C.esc(s.label)}</h2>` : ""}${s.tasks.map((t) => taskResult(t, ++n, ex)).join("")}`).join("")}
      <div class="btn-row" style="justify-content:center;margin:26px 0"><a class="btn" href="#/fach/${encodeURIComponent(id)}">Zum Fach</a><button class="btn primary" id="again">${C.icon("play")} Neue Probeklausur</button></div>
    </div>`;
    C.$app.querySelectorAll("[data-g]").forEach((el) => el.addEventListener("click", () => {
      const [k, i] = el.dataset.g.split("|"); const it = ex.grade[k].items[Number(i)]; if (it.fixed) return;
      it.ok = !it.ok; it.changed = true; C.store.set(curKey(id), ex); saveHistory(d, ex);
      const y = window.scrollY; render(); window.scrollTo(0, y);
    }));
    document.getElementById("again").onclick = async () => { const nx = await buildExamFor(d); C.store.set(curKey(id), nx); viewExam(id); window.scrollTo(0, 0); };
  };
  render();
}
async function buildExamFor(d) { return buildExam(d); }

function ringPct(p, nt) {
  const r = 42, Cc = 2 * Math.PI * r, f = Math.min(1, p / 100);
  return `<div class="gauge"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--track)" stroke-width="11"/>
    ${f > 0 ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${p >= 50 ? "var(--acc)" : "var(--coral)"}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${f * Cc} ${Cc}"/>` : ""}</svg>
    <div class="center"><b>${nt}</b><span>Note</span></div></div>`;
}
function gradeList(key, ex) {
  const g = ex.grade[key]; if (!g) return "";
  return `<ul class="crit">${g.items.map((it, i) => `<li class="${it.ok ? "ok" : "no"}${it.fixed ? " fixed" : ""}" data-g="${key}|${i}" role="button" tabindex="0" title="${it.fixed ? "automatisch bewertet" : "Klicken, um die Bewertung zu ändern"}">
    <span class="ck">${it.ok ? C.icon("check") : ""}</span><span class="lbl">${C.esc(it.label)}${it.auto ? "" : ` <em>selbst bewerten</em>`}</span><span class="p">${fmt(it.ok ? it.pts : 0, 1)}/${fmt(it.pts, 1)}</span></li>`).join("")}</ul>`;
}
const ansBox = (v) => `<div class="your">${v && String(v).trim() ? C.esc(v) : `<span class="faint">keine Antwort</span>`}</div>`;
const sol = (s) => `<details class="sol" open><summary>Musterlösung</summary><div>${C.esc(String(s || "").split(" // ").join("\n"))}</div></details>`;
function sumKeys(ex, keys) { let a = 0, b = 0; for (const k of keys) for (const it of ex.grade[k]?.items || []) { b += it.pts; if (it.ok) a += it.pts; } return `${fmt(half(a), 1)}/${fmt(half(b), 1)}`; }
function taskResult(t, n, ex) {
  const A = ex.answers;
  if (t.typ === "offen") return `<article class="task graded">${taskHeadR(t, n, sumKeys(ex, [t.id]))}<p class="task-q">${C.esc(t.frage)}</p>${ansBox(A[t.id])}${gradeList(t.id, ex)}${sol(t.loesung)}</article>`;
  if (t.typ === "mc") {
    const sel = [].concat(A[t.id] ?? []);
    return `<article class="task graded">${taskHeadR(t, n, sumKeys(ex, [t.id]))}<p class="task-q">${C.esc(t.frage)}</p><div class="mc">${t.order.map((i) => `<div class="mc-opt res ${t.richtig.includes(i) ? "right" : ""} ${sel.includes(i) && !t.richtig.includes(i) ? "wrong" : ""}"><span>${sel.includes(i) ? "●" : "○"}</span><span>${C.esc(t.optionen[i])}</span></div>`).join("")}</div>${t.loesung ? sol(t.loesung) : ""}</article>`;
  }
  if (t.typ === "fall") {
    const keys = t.teile.map((_, i) => `${t.id}#${i}`);
    return `<article class="task graded">${taskHeadR(t, n, sumKeys(ex, keys), "Fallvignette")}<div class="material">${C.esc(t.material)}</div>${t.teile.map((p, i) => `<div class="sub"><div class="sub-head"><span>${C.esc(p.frage)}</span><span class="task-pts">${sumKeys(ex, [keys[i]])} P</span></div>${ansBox(A[keys[i]])}${gradeList(keys[i], ex)}${sol(p.loesung)}</div>`).join("")}</article>`;
  }
  const keys = t.teile.map((_, i) => `${t.id}#${i}`);
  return `<article class="task graded">${taskHeadR(t, n, sumKeys(ex, keys), t.thema)}<div class="material">${C.esc(t.material)}</div>${t.tabelle ? tableHtml(t.tabelle) : ""}
    ${t.teile.map((p, i) => { const k = keys[i];
      const given = p.art === "zahl" ? p.felder.map((f, j) => `${f.label}: ${A[`${k}#${j}`] || "–"}`).join(" · ") : p.art === "wahl" ? `${A[k] !== undefined ? p.optionen[A[k]] : "–"}${A[k + "#b"] ? " – " + A[k + "#b"] : ""}` : A[k];
      return `<div class="sub"><div class="sub-head"><span>${String.fromCharCode(97 + i)}) ${C.esc(p.frage)}</span><span class="task-pts">${sumKeys(ex, [k])} P</span></div>${ansBox(given)}${gradeList(k, ex)}${p.loesung ? sol(p.loesung) : ""}</div>`; }).join("")}</article>`;
}
function taskHeadR(t, n, score, title) {
  return `<div class="task-head"><span class="task-no">Aufgabe ${n}</span>${title ? `<span class="task-topic">${C.esc(title)}</span>` : t.thema ? `<span class="task-topic">${C.esc(t.thema)}</span>` : ""}<span class="task-pts">${score} Punkte</span></div>`;
}
