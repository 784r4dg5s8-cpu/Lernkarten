// Statistik-Hilfen + Aufgabengeneratoren für Rechen-Probeklausuren (Inferenz- und deskriptive Statistik).
// Jede Generierung erzeugt neue Zufallsdaten und rechnet die Musterlösung selbst aus.

/* ---------- Verteilungen ---------- */
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function ibeta(x, a, b) { // regularisierte unvollständige Betafunktion
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
function gammp(a, x) { // regularisierte untere unvollständige Gammafunktion
  if (x <= 0) return 0;
  if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; } return sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
export const tCDF = (t, df) => { const x = df / (df + t * t); const p = 0.5 * ibeta(x, df / 2, 0.5); return t > 0 ? 1 - p : p; };
export const fCDF = (f, d1, d2) => f <= 0 ? 0 : ibeta(d1 * f / (d1 * f + d2), d1 / 2, d2 / 2);
export const chiCDF = (x, k) => gammp(k / 2, x / 2);
function invert(cdf, p, lo, hi) { for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (cdf(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
export const tQ = (p, df) => invert((t) => tCDF(t, df), p, -100, 100);
export const fQ = (p, d1, d2) => invert((f) => fCDF(f, d1, d2), p, 0, 1000);
export const chiQ = (p, k) => invert((x) => chiCDF(x, k), p, 0, 1000);
export const zQ = (p) => invert((z) => 0.5 * (1 + erf(z / Math.SQRT2)), p, -10, 10);
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }

/* ---------- Helfer ---------- */
const R = Math.random;
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const pick = (a) => a[Math.floor(R() * a.length)];
const normal = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const mean = (a) => sum(a) / a.length;
const r2 = (x) => Math.round(x * 100) / 100;
export const fmt = (x, d = 2) => (Number.isInteger(x) && d > 0 && Math.abs(x) < 1e6 ? x.toFixed(0) : (Math.round(x * 10 ** d) / 10 ** d).toFixed(d)).replace(".", ",");
const qsum = (a) => { const m = mean(a); return sum(a.map((x) => (x - m) ** 2)); };
const sdN1 = (a) => Math.sqrt(qsum(a) / (a.length - 1));
const cohen = (r) => { const a = Math.abs(r); return a < 0.1 ? "sehr klein" : a < 0.3 ? "klein" : a < 0.5 ? "mittel" : "groß"; };
const etaLabel = (e) => e < 0.01 ? "sehr klein" : e < 0.06 ? "klein" : e < 0.14 ? "mittel" : "groß";
const genData = (n, mu, sd, lo, hi, dec = 0) => Array.from({ length: n }, () => { const v = mu + sd * normal(); return Math.min(hi, Math.max(lo, Math.round(v * 10 ** dec) / 10 ** dec)); });
const alphaPick = () => pick([0.05, 0.05, 0.05, 0.01]);
const pct = (a) => `${Math.round(a * 100)} %`;

// Standard-Teilaufgaben
const partSeiten = (dir, begr, pts = 2) => ({
  frage: "Liegt eine einseitige oder zweiseitige Fragestellung vor? Begründen Sie anhand des Forschungsvorhabens.", punkte: pts, art: "wahl",
  optionen: ["einseitig (gerichtet)", "zweiseitig (ungerichtet)"], richtig: dir ? 0 : 1, loesung: begr,
});
const partEntscheidung = (sig, pts = 1) => ({ frage: "Signifikanzentscheidung", punkte: pts, art: "wahl", optionen: ["H0 verwerfen – signifikant", "H0 beibehalten – nicht signifikant"], richtig: sig ? 0 : 1 });
const kritText = "Kritische Werte bitte wie in der Klausur aus der Tabelle ablesen (Abweichungen durch Tabellenrundung werden toleriert).";

/* ---------- Szenarien ---------- */
const SZ_T_UNABH = [
  { a: "Gamer:innen", b: "Nicht-Gamer:innen", av: "Reaktionszeit (ms)", mu: 250, sd: 20, eff: 18, ctx: "Eine Verkehrspsychologin untersucht, ob sich die Reaktionszeit am Fahrsimulator zwischen Personen, die regelmäßig Videospiele spielen, und Personen, die das nicht tun, unterscheidet.", dirText: "ob Gamer:innen schneller reagieren (kürzere Reaktionszeit)", lo: 150, hi: 400, low: true },
  { a: "Achtsamkeitsgruppe", b: "Kontrollgruppe", av: "Stresswert (0–40)", mu: 22, sd: 5, eff: 5, ctx: "Ein Gesundheitspsychologe vergleicht den Stresswert von Studierenden nach einem achtwöchigen Achtsamkeitstraining mit einer Kontrollgruppe ohne Training.", dirText: "ob die Achtsamkeitsgruppe geringere Stresswerte hat", lo: 0, hi: 40, low: true },
  { a: "Lerngruppe mit Karteikarten", b: "Lerngruppe mit Zusammenfassungen", av: "Punkte im Wissenstest (0–50)", mu: 32, sd: 6, eff: 5, ctx: "Eine Lernpsychologin vergleicht zwei Lernmethoden. Studierende lernen entweder mit Karteikarten oder mit Zusammenfassungen und schreiben anschließend denselben Wissenstest.", dirText: "ob die Karteikarten-Gruppe besser abschneidet", lo: 0, hi: 50, low: false },
];
const SZ_T_ABH = [
  { t1: "vor dem Training", t2: "nach dem Training", av: "Selbstwert (Rosenberg, 10–40)", mu: 24, sd: 4, eff: 3, ctx: "Eine Psychologin prüft, ob sich der Selbstwert von Teilnehmenden durch ein sechswöchiges Selbstwerttraining verändert. Alle Personen werden vorher und nachher befragt.", dirText: "ob der Selbstwert nach dem Training höher ist", lo: 10, hi: 40 },
  { t1: "vor der Intervention", t2: "nach der Intervention", av: "Schlafqualität (0–20)", mu: 10, sd: 3, eff: 2.5, ctx: "Ein Schlafforscher untersucht, ob eine Schlafhygiene-Schulung die Schlafqualität verbessert. Dieselben Personen füllen den Fragebogen vor und nach der Schulung aus.", dirText: "ob die Schlafqualität nach der Schulung besser ist", lo: 0, hi: 20 },
];
const SZ_KORR = [
  { x: "tägliche Smartphone-Nutzung (h)", y: "Schlafqualität (0–10)", mx: 4.5, sx: 1, my: 7, sy: 1, rho: -0.7, dx: 1, dy: 1, ctx: "Ein Medienpsychologe untersucht den Zusammenhang zwischen täglicher Smartphone-Nutzung und Schlafqualität bei jungen Erwachsenen." },
  { x: "Lernzeit pro Woche (h)", y: "Klausurpunkte (0–60)", mx: 8, sx: 3, my: 38, sy: 8, rho: 0.6, dx: 0, dy: 0, ctx: "Eine Bildungspsychologin untersucht den Zusammenhang zwischen wöchentlicher Lernzeit und Klausurleistung." },
  { x: "Arbeitsstunden pro Woche", y: "Erschöpfung (0–30)", mx: 40, sx: 6, my: 15, sy: 5, rho: 0.55, dx: 0, dy: 0, ctx: "Eine Arbeitspsychologin untersucht, ob die Wochenarbeitszeit mit emotionaler Erschöpfung zusammenhängt." },
];
const SZ_ANOVA = [
  { g: ["mündliches Feedback", "schriftliches Feedback", "Video-Feedback"], av: "Prüfungsleistung (0–100)", mu: 60, sd: 8, eff: [0, 2, 12], ctx: "Eine Bildungspsychologin untersucht, ob die Art des Feedbacks die Prüfungsleistung beeinflusst. Studierende werden zufällig einer von drei Feedbackformen zugeteilt.", lo: 0, hi: 100 },
  { g: ["Musik", "Stille", "Weißes Rauschen"], av: "Konzentrationswert (0–50)", mu: 30, sd: 5, eff: [0, 5, 2], ctx: "Ein Kognitionspsychologe untersucht, ob die Geräuschkulisse beim Lernen die Konzentration beeinflusst. Die Versuchspersonen werden zufällig drei Bedingungen zugeteilt.", lo: 0, hi: 50 },
  { g: ["Kurzzeittherapie", "Gruppentherapie", "Warteliste"], av: "Depressivität (BDI, 0–63)", mu: 22, sd: 5, eff: [-8, -5, 0], ctx: "Eine klinische Psychologin vergleicht die Depressivität nach drei Monaten zwischen drei zufällig zugeteilten Behandlungsbedingungen.", lo: 0, hi: 63 },
];
const SZ_RM = [
  { t: ["Woche 1", "Woche 3", "Woche 6"], av: "Körperliches Wohlbefinden (0–40)", ctx: "Eine Sportpsychologin erhebt das körperliche Wohlbefinden derselben Personen zu drei Messzeitpunkten während eines Lauftrainings." },
  { t: ["Semesterbeginn", "Semestermitte", "Klausurphase"], av: "Arbeitsbelastung (0–40)", ctx: "Ein Hochschulpsychologe erhebt die empfundene Arbeitsbelastung derselben Studierenden zu drei Zeitpunkten im Semester." },
];
const SZ_REG = [
  { x: "Anzahl Beratungstermine", y: "Zufriedenheit (0–100)", mx: 5, sx: 2, a0: 40, b0: 6, e: 8, ctx: "Eine Beratungsstelle möchte wissen, ob sich die Zufriedenheit der Klient:innen durch die Anzahl der Beratungstermine vorhersagen lässt.", x0: 7, dx: 0 },
  { x: "Trainingseinheiten pro Monat", y: "Ausdauerwert (0–50)", mx: 8, sx: 3, a0: 15, b0: 2, e: 4, ctx: "Ein Sportpsychologe untersucht, ob sich die Ausdauerleistung durch die Anzahl der Trainingseinheiten vorhersagen lässt.", x0: 9, dx: 0 },
];
const SZ_CHI = [
  { r: ["Weiterbildung ja", "Weiterbildung nein"], c: ["befördert", "nicht befördert"], ctx: "Eine Organisationspsychologin prüft, ob die Teilnahme an einer Weiterbildung mit einer Beförderung innerhalb eines Jahres zusammenhängt." },
  { r: ["Studierende", "Berufstätige"], c: ["Printmedien", "Online", "Podcast"], ctx: "Ein Medienpsychologe prüft, ob die bevorzugte Informationsquelle von der Lebenssituation (Studium vs. Beruf) abhängt." },
  { r: ["Frauen", "Männer"], c: ["Therapie in Anspruch genommen", "nicht in Anspruch genommen"], ctx: "Eine Versorgungsforscherin prüft, ob die Inanspruchnahme von Psychotherapie bei psychischer Belastung mit dem Geschlecht zusammenhängt." },
];

/* ---------- Generatoren Inferenzstatistik ---------- */
function laie(pts, kern) {
  return { frage: "Erklären Sie das Ergebnis so, dass ein Laie es verstehen kann.", punkte: pts, art: "text", loesung: kern,
    kriterien: [{ text: "Richtige Aussage zur Signifikanz (bedeutsam / zufällig)", punkte: 1, stichworte: [] }, { text: "Richtung/Inhalt des Ergebnisses im Kontext benannt", punkte: pts - 1, stichworte: [] }] };
}
function hyp(pts, h0, h1, stich) {
  return { frage: "Formulieren Sie die Null- und die Alternativhypothese.", punkte: pts, art: "text", loesung: `H0: ${h0} // H1: ${h1}`,
    kriterien: [{ text: "H0 korrekt (kein Unterschied / kein Zusammenhang bzw. Richtung der Nullhypothese)", punkte: Math.ceil(pts / 2), stichworte: ["h0", "nullhypo", "kein unterschied", "kein zusammenhang", "gleich"] },
      { text: "H1 korrekt (inkl. Richtung, falls gerichtet)", punkte: pts - Math.ceil(pts / 2), stichworte: stich }] };
}

function genTUnabh() {
  const s = pick(SZ_T_UNABH), n1 = ri(6, 8), n2 = ri(6, 8), dir = R() < 0.5, alpha = alphaPick();
  const low = s.low; // true: Gruppe A soll niedrigere Werte haben
  const shift = (R() < 0.75 ? 1 : 0.2) * s.eff * (low ? -1 : 1);
  const A = genData(n1, s.mu + shift, s.sd, s.lo, s.hi), B = genData(n2, s.mu, s.sd, s.lo, s.hi);
  const ma = mean(A), mb = mean(B), qa = qsum(A), qb = qsum(B);
  const df = n1 + n2 - 2, sp2 = (qa + qb) / df, se = Math.sqrt(sp2 * (1 / n1 + 1 / n2)), t = (ma - mb) / se;
  const tk = dir ? tQ(1 - alpha, df) : tQ(1 - alpha / 2, df);
  const sig = dir ? (low ? t < -tk : t > tk) : Math.abs(t) > tk;
  return {
    typ: "rechnen", thema: "t-Test für unabhängige Stichproben", punkte: 23,
    material: `${s.ctx} Dazu werden ${n1 + n2} Personen untersucht (${s.a}: n = ${n1}, ${s.b}: n = ${n2}).\nForschungsvorhaben: ${dir ? `Es soll geprüft werden, ${s.dirText}.` : `Es soll geprüft werden, ob sich die beiden Gruppen unterscheiden.`} AV: ${s.av}. Das Signifikanzniveau wird vorab auf α = ${fmt(alpha * 100, 0)} % festgelegt.`,
    tabelle: { kopf: [s.a, s.b], zeilen: Array.from({ length: Math.max(n1, n2) }, (_, i) => [A[i] ?? "", B[i] ?? ""]) },
    gegeben: `x̄(${s.a}) = ${fmt(ma)} · x̄(${s.b}) = ${fmt(mb)} · QS(${s.a}) = ${fmt(qa)} · QS(${s.b}) = ${fmt(qb)}`,
    teile: [
      { frage: "Handelt es sich um ein abhängiges oder ein unabhängiges Design?", punkte: 2, art: "wahl", optionen: ["abhängig", "unabhängig"], richtig: 1, loesung: "Unabhängig: verschiedene Personen in den beiden Gruppen, keine Paarbildung oder Messwiederholung." },
      partSeiten(dir, dir ? "Einseitig: Das Forschungsvorhaben nennt eine Richtung." : "Zweiseitig: Es wird nur nach einem Unterschied gefragt, keine Richtung vorgegeben."),
      hyp(3, dir ? `μ(${s.a}) ${low ? "≥" : "≤"} μ(${s.b})` : `μ(${s.a}) = μ(${s.b})`, dir ? `μ(${s.a}) ${low ? "<" : ">"} μ(${s.b})` : `μ(${s.a}) ≠ μ(${s.b})`, ["h1", "alternativhyp", "unterschied", low ? "kleiner" : "größer", "ungleich"]),
      { frage: "Berechnen Sie die Prüfgröße t (gepoolte Varianz).", punkte: 10, art: "zahl", felder: [{ label: "gepoolte Varianz s²", wert: sp2 }, { label: "Standardfehler der Differenz", wert: se }, { label: "t", wert: t }],
        loesung: `s²pool = (QS₁ + QS₂)/(n₁ + n₂ − 2) = (${fmt(qa)} + ${fmt(qb)})/${df} = ${fmt(sp2)} // SE = √(s²pool · (1/n₁ + 1/n₂)) = ${fmt(se)} // t = (x̄₁ − x̄₂)/SE = (${fmt(ma)} − ${fmt(mb)})/${fmt(se)} = ${fmt(t)}` },
      { frage: `Bestimmen Sie die Freiheitsgrade und den kritischen t-Wert (${dir ? "einseitig" : "zweiseitig"}, α = ${fmt(alpha * 100, 0)} %). ${kritText}`, punkte: 2, art: "zahl", felder: [{ label: "df", wert: df, tol: 0 }, { label: "t krit", wert: tk, rel: 0.03 }], loesung: `df = n₁ + n₂ − 2 = ${df} // t krit = ${fmt(tk, 3)}${dir ? ` (bei gerichteter Hypothese ${low ? "−" : "+"}${fmt(tk, 3)})` : " (±)"}` },
      partEntscheidung(sig),
      laie(3, sig ? `Die beiden Gruppen unterscheiden sich bedeutsam: ${s.a} hat im Mittel ${ma < mb ? "niedrigere" : "höhere"} Werte (${fmt(ma)} vs. ${fmt(mb)}). Der Unterschied ist so groß, dass er sehr wahrscheinlich nicht zufällig ist.` : `Die Mittelwerte unterscheiden sich zwar (${fmt(ma)} vs. ${fmt(mb)}), aber so wenig, dass der Unterschied auch zufällig entstanden sein kann – ein echter Unterschied ist nicht belegt.`),
    ],
  };
}

function genTAbh() {
  const s = pick(SZ_T_ABH), n = ri(6, 8), dir = R() < 0.5, alpha = alphaPick();
  const pre = genData(n, s.mu, s.sd, s.lo, s.hi);
  const eff = (R() < 0.75 ? 1 : 0.15) * s.eff;
  const post = pre.map((x) => Math.min(s.hi, Math.max(s.lo, Math.round(x + eff + s.sd * 0.6 * normal()))));
  const d = post.map((x, i) => x - pre[i]), md = mean(d), sd = sdN1(d), se = sd / Math.sqrt(n), t = md / se, df = n - 1;
  const tk = dir ? tQ(1 - alpha, df) : tQ(1 - alpha / 2, df);
  const sig = dir ? t > tk : Math.abs(t) > tk;
  return {
    typ: "rechnen", thema: "t-Test für abhängige Stichproben", punkte: 22,
    material: `${s.ctx}\nForschungsvorhaben: ${dir ? `Es soll geprüft werden, ${s.dirText}.` : "Es soll geprüft werden, ob sich die Werte zwischen den beiden Messzeitpunkten verändern."} α = ${fmt(alpha * 100, 0)} %.`,
    tabelle: { kopf: ["Person", s.t1, s.t2, "d = nachher − vorher"], zeilen: pre.map((x, i) => [i + 1, x, post[i], ""]) },
    gegeben: `Mittelwert der Differenzen d̄ und s_d bitte selbst berechnen (s_d mit n − 1).`,
    teile: [
      { frage: "Handelt es sich um ein abhängiges oder ein unabhängiges Design? Begründen Sie.", punkte: 2, art: "wahl", optionen: ["abhängig", "unabhängig"], richtig: 0, loesung: "Abhängig: dieselben Personen werden zweimal gemessen (Messwiederholung)." },
      partSeiten(dir, dir ? "Einseitig: Es wird eine Verbesserung erwartet." : "Zweiseitig: Es wird nur nach einer Veränderung gefragt."),
      hyp(3, dir ? "μd ≤ 0" : "μd = 0", dir ? "μd > 0 (Verbesserung)" : "μd ≠ 0", ["h1", "alternativhyp", "verbesser", "veränder", "unterschied", "größer", "ungleich"]),
      { frage: "Berechnen Sie d̄, s_d, den Standardfehler und die Prüfgröße t.", punkte: 9, art: "zahl", felder: [{ label: "d̄", wert: md }, { label: "s_d", wert: sd }, { label: "SE = s_d/√n", wert: se }, { label: "t", wert: t }],
        loesung: `Differenzen: ${d.join("; ")} // d̄ = ${fmt(md)} // s_d = ${fmt(sd)} // SE = ${fmt(sd)}/√${n} = ${fmt(se)} // t = d̄/SE = ${fmt(t)}` },
      { frage: `Freiheitsgrade und kritischer t-Wert (${dir ? "einseitig" : "zweiseitig"}, α = ${fmt(alpha * 100, 0)} %). ${kritText}`, punkte: 2, art: "zahl", felder: [{ label: "df", wert: df, tol: 0 }, { label: "t krit", wert: tk, rel: 0.03 }], loesung: `df = n − 1 = ${df} // t krit = ${fmt(tk, 3)}` },
      partEntscheidung(sig),
      laie(3, sig ? `Die Werte haben sich im Mittel um ${fmt(md)} Punkte verändert – so deutlich, dass das sehr wahrscheinlich kein Zufall ist.` : `Die Werte haben sich im Mittel nur um ${fmt(md)} Punkte verändert; das kann auch Zufall sein – eine echte Veränderung ist nicht belegt.`),
    ],
  };
}

function genKorr() {
  const s = pick(SZ_KORR), n = ri(6, 8), alpha = alphaPick(), dir = R() < 0.4;
  let X, Y, r;
  for (let k = 0; k < 50; k++) {
    X = genData(n, s.mx, s.sx, 0, 1e9, s.dx);
    const rho = s.rho * (R() < 0.8 ? 1 : 0.2);
    Y = X.map((x) => { const zx = (x - s.mx) / s.sx; const v = s.my + s.sy * (rho * zx + Math.sqrt(1 - rho * rho) * normal()); return Math.max(0, Math.round(v * 10 ** s.dy) / 10 ** s.dy); });
    const mx = mean(X), my = mean(Y);
    const sxy = sum(X.map((x, i) => (x - mx) * (Y[i] - my)));
    r = sxy / Math.sqrt(qsum(X) * qsum(Y));
    if (isFinite(r) && Math.abs(r) < 0.97) break;
  }
  const mx = mean(X), my = mean(Y), sx = sdN1(X), sy = sdN1(Y), cov = sum(X.map((x, i) => (x - mx) * (Y[i] - my))) / (n - 1);
  const t = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r), df = n - 2;
  const tk = dir ? tQ(1 - alpha, df) : tQ(1 - alpha / 2, df);
  const want = s.rho > 0 ? 1 : -1;
  const sig = dir ? t * want > tk : Math.abs(t) > tk;
  return {
    typ: "rechnen", thema: "Korrelation und Signifikanztest", punkte: 22,
    material: `${s.ctx} Dazu werden bei ${n} Personen beide Variablen erhoben.\nForschungsvorhaben: ${dir ? `Es wird ein ${want > 0 ? "positiver" : "negativer"} Zusammenhang erwartet.` : "Es soll geprüft werden, ob ein linearer Zusammenhang besteht."} α = ${fmt(alpha * 100, 0)} %.`,
    tabelle: { kopf: [s.x, s.y], zeilen: X.map((x, i) => [fmt(x, s.dx), fmt(Y[i], s.dy)]) },
    gegeben: `x̄ = ${fmt(mx)} · s_x = ${fmt(sx)} · ȳ = ${fmt(my)} · s_y = ${fmt(sy)} (jeweils mit n − 1)`,
    teile: [
      partSeiten(dir, dir ? "Einseitig: Die Richtung des Zusammenhangs wird vorhergesagt." : "Zweiseitig: Es wird nur nach einem Zusammenhang gefragt."),
      hyp(3, dir ? `ρ ${want > 0 ? "≤" : "≥"} 0` : "ρ = 0", dir ? `ρ ${want > 0 ? ">" : "<"} 0` : "ρ ≠ 0", ["h1", "alternativhyp", "zusammenhang", "positiv", "negativ", "ungleich"]),
      { frage: "Berechnen Sie die Kovarianz und den Korrelationskoeffizienten r nach Pearson.", punkte: 8, art: "zahl", felder: [{ label: "Kovarianz", wert: cov }, { label: "r", wert: r, tol: 0.02 }], loesung: `cov = Σ(x − x̄)(y − ȳ)/(n − 1) = ${fmt(cov)} // r = cov/(s_x · s_y) = ${fmt(cov)}/(${fmt(sx)} · ${fmt(sy)}) = ${fmt(r)}` },
      { frage: "Berechnen Sie die Prüfgröße t für den Signifikanztest der Korrelation.", punkte: 4, art: "zahl", felder: [{ label: "t", wert: t }], loesung: `t = r · √(n − 2)/√(1 − r²) = ${fmt(t)}` },
      { frage: `Freiheitsgrade und kritischer Wert (${dir ? "einseitig" : "zweiseitig"}). ${kritText}`, punkte: 1, art: "zahl", felder: [{ label: "df", wert: df, tol: 0 }, { label: "t krit", wert: tk, rel: 0.03 }], loesung: `df = n − 2 = ${df} // t krit = ${fmt(tk, 3)}` },
      partEntscheidung(sig),
      laie(3, `Es zeigt sich ein ${cohen(r)}er ${r > 0 ? "positiver" : "negativer"} Zusammenhang (r = ${fmt(r)}): ${r > 0 ? "Je mehr" : "Je mehr"} ${s.x.replace(/ \(.*/, "")}, desto ${r > 0 ? "höher" : "niedriger"} ${s.y.replace(/ \(.*/, "")}. ${sig ? "Der Zusammenhang ist statistisch bedeutsam." : "Er ist aber nicht signifikant und könnte zufällig sein."}`),
    ],
  };
}

function genFisher() {
  const n1 = ri(30, 60), n2 = ri(30, 60);
  const r1 = r2(0.2 + R() * 0.55), r2v = r2(Math.min(0.9, Math.max(0.05, r1 + (R() < 0.5 ? 1 : -1) * (0.05 + R() * 0.35))));
  const z1 = 0.5 * Math.log((1 + r1) / (1 - r1)), z2 = 0.5 * Math.log((1 + r2v) / (1 - r2v));
  const se = Math.sqrt(1 / (n1 - 3) + 1 / (n2 - 3)), z = (z1 - z2) / se, zk = 1.96, sig = Math.abs(z) > zk;
  const ctx = pick([["Arbeitszufriedenheit und Produktivität", "IT-Branche", "Einzelhandel"], ["Selbstwirksamkeit und Lernerfolg", "Präsenzstudium", "Fernstudium"], ["Stress und Schlafdauer", "Pflegekräfte", "Bürokräfte"]]);
  return {
    typ: "rechnen", thema: "Vergleich zweier Korrelationen (Fisher-Z)", punkte: 18,
    material: `Zwei Forscherinnen untersuchen unabhängig voneinander den Zusammenhang zwischen ${ctx[0]}. Studie 1 (${ctx[1]}, n₁ = ${n1}) ergibt r₁ = ${fmt(r1)}, Studie 2 (${ctx[2]}, n₂ = ${n2}) ergibt r₂ = ${fmt(r2v)}.\nForschungsvorhaben: Es soll geprüft werden, ob sich die beiden Korrelationen signifikant unterscheiden (zweiseitig, α = 5 %).`,
    teile: [
      hyp(3, "ρ₁ = ρ₂", "ρ₁ ≠ ρ₂", ["h1", "alternativhyp", "unterschied", "ungleich"]),
      { frage: "Transformieren Sie beide Korrelationen in Fishers Z-Werte.", punkte: 4, art: "zahl", felder: [{ label: "Z₁", wert: z1, tol: 0.02 }, { label: "Z₂", wert: z2, tol: 0.02 }], loesung: `Z = ½ · ln((1 + r)/(1 − r)) // Z₁ = ${fmt(z1)} · Z₂ = ${fmt(z2)}` },
      { frage: "Berechnen Sie die Prüfgröße z.", punkte: 6, art: "zahl", felder: [{ label: "Standardfehler", wert: se, tol: 0.01 }, { label: "z", wert: z }], loesung: `SE = √(1/(n₁ − 3) + 1/(n₂ − 3)) = ${fmt(se, 3)} // z = (Z₁ − Z₂)/SE = ${fmt(z)}` },
      { frage: "Kritischer Wert (zweiseitig, α = 5 %)", punkte: 1, art: "zahl", felder: [{ label: "z krit", wert: 1.96, tol: 0.02 }], loesung: "z krit = 1,96" },
      partEntscheidung(sig),
      laie(3, sig ? "Der Zusammenhang ist in den beiden Gruppen unterschiedlich stark – der Unterschied ist bedeutsam." : "Die beiden Zusammenhänge sind statistisch nicht unterschiedlich stark; der Unterschied kann zufällig sein."),
    ],
  };
}

function genAnova() {
  const s = pick(SZ_ANOVA), n = ri(4, 5), k = 3, alpha = 0.05, scale = R() < 0.75 ? 1 : 0.15;
  const G = s.g.map((_, j) => genData(n, s.mu + s.eff[j] * scale, s.sd, s.lo, s.hi));
  const all = G.flat(), gm = mean(all), ms = G.map(mean);
  const qsZw = sum(ms.map((m) => n * (m - gm) ** 2)), qsIn = sum(G.map(qsum)), qsT = qsum(all);
  const dfZ = k - 1, dfI = k * n - k, mqZ = qsZw / dfZ, mqI = qsIn / dfI, F = mqZ / mqI, fk = fQ(1 - alpha, dfZ, dfI), eta = qsZw / qsT, sig = F > fk;
  return {
    typ: "rechnen", thema: "Einfaktorielle Varianzanalyse", punkte: 24,
    material: `${s.ctx} Pro Bedingung werden ${n} Personen untersucht. AV: ${s.av}.\nForschungsvorhaben: Es soll geprüft werden, ob sich die Bedingungen unterscheiden. α = 5 %.`,
    tabelle: { kopf: s.g, zeilen: Array.from({ length: n }, (_, i) => G.map((g) => g[i])) },
    gegeben: `Gruppenmittelwerte: ${s.g.map((g, j) => `${g} = ${fmt(ms[j])}`).join(" · ")} · Gesamtmittelwert = ${fmt(gm)}`,
    teile: [
      hyp(3, "μ₁ = μ₂ = μ₃", "mindestens zwei Mittelwerte unterscheiden sich", ["h1", "alternativhyp", "mindestens", "unterschied", "ungleich"]),
      { frage: "Füllen Sie die Varianzanalyse-Tabelle aus (QS, df, MQ, F).", punkte: 11, art: "zahl", felder: [
        { label: "QS zwischen", wert: qsZw }, { label: "QS innerhalb", wert: qsIn }, { label: "df zwischen", wert: dfZ, tol: 0 }, { label: "df innerhalb", wert: dfI, tol: 0 },
        { label: "MQ zwischen", wert: mqZ }, { label: "MQ innerhalb", wert: mqI }, { label: "F", wert: F }],
        loesung: `QS zw = Σ n·(x̄ⱼ − x̄)² = ${fmt(qsZw)} // QS inn = Σ QS je Gruppe = ${fmt(qsIn)} // df zw = k − 1 = ${dfZ} · df inn = N − k = ${dfI} // MQ zw = ${fmt(mqZ)} · MQ inn = ${fmt(mqI)} // F = MQ zw/MQ inn = ${fmt(F)}` },
      { frage: `Kritischer F-Wert (α = 5 %) und Entscheidung. ${kritText}`, punkte: 2, art: "zahl", felder: [{ label: "F krit", wert: fk, rel: 0.03 }], loesung: `F krit(${dfZ}; ${dfI}) = ${fmt(fk)}` },
      partEntscheidung(sig),
      { frage: "Berechnen Sie η² und ordnen Sie es nach Cohen ein.", punkte: 4, art: "zahl", felder: [{ label: "η²", wert: eta, tol: 0.02 }], loesung: `η² = QS zw/QS total = ${fmt(qsZw)}/${fmt(qsT)} = ${fmt(eta)} → ${etaLabel(eta)}er Effekt (.01 klein, .06 mittel, .14 groß)` },
      laie(3, sig ? `Die Bedingungen unterscheiden sich bedeutsam (${pct(eta)} der Unterschiede in den Werten gehen auf die Bedingung zurück). Welche Gruppen sich genau unterscheiden, zeigen erst Post-hoc-Tests.` : "Die Unterschiede zwischen den Bedingungen sind nicht größer als durch Zufall zu erwarten."),
    ],
  };
}

function genRm() {
  const s = pick(SZ_RM), n = ri(5, 6), k = 3, alpha = 0.05, scale = R() < 0.75 ? 1 : 0.1;
  const base = genData(n, 20, 5, 4, 36), trend = [0, 3 * scale, 6 * scale].map((x) => (s.av.startsWith("Arbeits") ? x * 1.2 : x));
  const D = base.map((b) => trend.map((t) => Math.max(0, Math.min(40, Math.round(b + t + 1.8 * normal())))));
  const all = D.flat(), gm = mean(all);
  const mt = [0, 1, 2].map((j) => mean(D.map((r) => r[j]))), mp = D.map(mean);
  const qsT = qsum(all), qsTr = sum(mt.map((m) => n * (m - gm) ** 2)), qsV = sum(mp.map((m) => k * (m - gm) ** 2)), qsR = qsT - qsTr - qsV;
  const dfTr = k - 1, dfR = (k - 1) * (n - 1), mqTr = qsTr / dfTr, mqR = qsR / dfR, F = mqTr / mqR, fk = fQ(0.95, dfTr, dfR), sig = F > fk, etaP = qsTr / (qsTr + qsR);
  return {
    typ: "rechnen", thema: "Varianzanalyse mit Messwiederholung", punkte: 22,
    material: `${s.ctx} (n = ${n}). AV: ${s.av}.\nForschungsvorhaben: Es soll geprüft werden, ob sich die Werte über die drei Messzeitpunkte verändern. α = 5 %. Sphärizität kann angenommen werden.`,
    tabelle: { kopf: ["Person", ...s.t], zeilen: D.map((r, i) => [i + 1, ...r]) },
    gegeben: `Teilweise ausgefüllte Tabelle: QS total = ${fmt(qsT)} · QS Treatment (Messzeitpunkt) = ${fmt(qsTr)} · QS zwischen Vpn = ${fmt(qsV)}`,
    teile: [
      hyp(3, "μ₁ = μ₂ = μ₃", "mindestens zwei Messzeitpunkte unterscheiden sich", ["h1", "alternativhyp", "mindestens", "unterschied", "veränder"]),
      { frage: "Ergänzen Sie die Tabelle: QS Residual, df, MQ und F.", punkte: 10, art: "zahl", felder: [
        { label: "QS Residual", wert: qsR }, { label: "df Treatment", wert: dfTr, tol: 0 }, { label: "df Residual", wert: dfR, tol: 0 },
        { label: "MQ Treatment", wert: mqTr }, { label: "MQ Residual", wert: mqR }, { label: "F", wert: F }],
        loesung: `QS Res = QS tot − QS Treat − QS Vpn = ${fmt(qsR)} // df Treat = k − 1 = ${dfTr} · df Res = (k − 1)(n − 1) = ${dfR} // MQ Treat = ${fmt(mqTr)} · MQ Res = ${fmt(mqR)} // F = ${fmt(F)}` },
      { frage: `Kritischer F-Wert (α = 5 %). ${kritText}`, punkte: 2, art: "zahl", felder: [{ label: "F krit", wert: fk, rel: 0.03 }], loesung: `F krit(${dfTr}; ${dfR}) = ${fmt(fk)}` },
      partEntscheidung(sig),
      { frage: "Berechnen Sie das partielle η² und ordnen Sie es ein.", punkte: 3, art: "zahl", felder: [{ label: "η²p", wert: etaP, tol: 0.02 }], loesung: `η²p = QS Treat/(QS Treat + QS Res) = ${fmt(etaP)} → ${etaLabel(etaP)}er Effekt` },
      laie(3, sig ? "Die Werte verändern sich über die Messzeitpunkte bedeutsam." : "Über die Messzeitpunkte zeigt sich keine bedeutsame Veränderung."),
    ],
  };
}

function genReg() {
  const s = pick(SZ_REG), n = ri(6, 8);
  const X = genData(n, s.mx, s.sx, 0, 1e9, s.dx), b0 = s.b0 * (R() < 0.8 ? 1 : 0.2);
  const Y = X.map((x) => Math.max(0, Math.round(s.a0 + b0 * x + s.e * normal())));
  const mx = mean(X), my = mean(Y), qx = qsum(X), sxy = sum(X.map((x, i) => (x - mx) * (Y[i] - my)));
  const b = sxy / qx, a = my - b * mx, r = sxy / Math.sqrt(qx * qsum(Y)), R2 = r * r, yhat = a + b * s.x0;
  return {
    typ: "rechnen", thema: "Einfache lineare Regression", punkte: 22,
    material: `${s.ctx} Dazu werden ${n} Personen erfasst.`,
    tabelle: { kopf: [s.x + " (x)", s.y + " (y)"], zeilen: X.map((x, i) => [x, Y[i]]) },
    gegeben: `x̄ = ${fmt(mx)} · ȳ = ${fmt(my)}`,
    teile: [
      { frage: "Welche Variable ist Prädiktor, welche Kriterium?", punkte: 2, art: "wahl", optionen: [`Prädiktor: ${s.x}; Kriterium: ${s.y}`, `Prädiktor: ${s.y}; Kriterium: ${s.x}`], richtig: 0, loesung: `Prädiktor (UV) ist ${s.x}, Kriterium (AV) ist ${s.y}.` },
      { frage: "Berechnen Sie die Regressionskoeffizienten b (Steigung) und a (Achsenabschnitt).", punkte: 9, art: "zahl", felder: [{ label: "b", wert: b }, { label: "a", wert: a, tol: 0.1 }], loesung: `b = Σ(x − x̄)(y − ȳ)/Σ(x − x̄)² = ${fmt(sxy)}/${fmt(qx)} = ${fmt(b)} // a = ȳ − b·x̄ = ${fmt(my)} − ${fmt(b)}·${fmt(mx)} = ${fmt(a)}` },
      { frage: "Stellen Sie die Regressionsgleichung auf und interpretieren Sie b.", punkte: 3, art: "text", loesung: `ŷ = ${fmt(a)} + ${fmt(b)} · x. Pro zusätzlicher Einheit ${s.x} steigt ${s.y} im Mittel um ${fmt(b)} Punkte.`,
        kriterien: [{ text: "Gleichung ŷ = a + b·x mit den Werten", punkte: 1, stichworte: ["ŷ", "y =", "y=", "a +", "+ b"] }, { text: "Interpretation: Veränderung von y pro Einheit x", punkte: 2, stichworte: ["pro einheit", "je einheit", "pro zusätzlich", "steigt", "erhöht", "zunahme", "nimmt"] }] },
      { frage: `Welcher Wert wird für eine Person mit x = ${s.x0} vorhergesagt?`, punkte: 3, art: "zahl", felder: [{ label: "ŷ", wert: yhat, tol: 0.3 }], loesung: `ŷ = ${fmt(a)} + ${fmt(b)} · ${s.x0} = ${fmt(yhat)}` },
      { frage: "Berechnen Sie den Determinationskoeffizienten R² und interpretieren Sie ihn.", punkte: 5, art: "zahl", felder: [{ label: "R²", wert: R2, tol: 0.02 }], loesung: `r = ${fmt(r)} → R² = ${fmt(R2)}: ${pct(R2)} der Varianz von ${s.y} werden durch ${s.x} aufgeklärt.` },
    ],
  };
}

function genChi() {
  const s = pick(SZ_CHI), rN = s.r.length, cN = s.c.length, alpha = 0.05, assoc = R() < 0.7;
  const O = s.r.map((_, i) => s.c.map((_, j) => Math.max(5, Math.round(12 + 6 * R() + (assoc ? (i === j % rN ? 8 : -3) * (j < rN ? 1 : 0.5) : 0) + 3 * normal()))));
  const rs = O.map(sum), cs = s.c.map((_, j) => sum(O.map((r) => r[j]))), N = sum(rs);
  const E = O.map((r, i) => r.map((_, j) => rs[i] * cs[j] / N));
  const chi = sum(O.flatMap((r, i) => r.map((o, j) => (o - E[i][j]) ** 2 / E[i][j]))), df = (rN - 1) * (cN - 1), ck = chiQ(1 - alpha, df), sig = chi > ck;
  const V = Math.sqrt(chi / (N * (Math.min(rN, cN) - 1)));
  return {
    typ: "rechnen", thema: "χ²-Unabhängigkeitstest", punkte: 20,
    material: `${s.ctx} Es werden ${N} Personen befragt. α = 5 %.`,
    tabelle: { kopf: ["", ...s.c, "Σ"], zeilen: [...O.map((r, i) => [s.r[i], ...r, rs[i]]), ["Σ", ...cs, N]] },
    teile: [
      hyp(3, "Die Merkmale sind unabhängig.", "Die Merkmale hängen zusammen.", ["h1", "alternativhyp", "zusammenh", "abhängig"]),
      { frage: `Berechnen Sie die erwartete Häufigkeit für die Zelle „${s.r[0]} / ${s.c[0]}“.`, punkte: 2, art: "zahl", felder: [{ label: "e₁₁", wert: E[0][0] }], loesung: `e = Zeilensumme · Spaltensumme / N = ${rs[0]} · ${cs[0]} / ${N} = ${fmt(E[0][0])}` },
      { frage: "Berechnen Sie χ² (alle Zellen).", punkte: 8, art: "zahl", felder: [{ label: "χ²", wert: chi, rel: 0.03 }], loesung: `χ² = Σ (b − e)²/e = ${fmt(chi)} // erwartete Häufigkeiten: ${E.map((r) => r.map((e) => fmt(e)).join(" | ")).join(" // ")}` },
      { frage: `Freiheitsgrade und kritischer Wert (α = 5 %). ${kritText}`, punkte: 2, art: "zahl", felder: [{ label: "df", wert: df, tol: 0 }, { label: "χ² krit", wert: ck, rel: 0.03 }], loesung: `df = (Zeilen − 1)(Spalten − 1) = ${df} // χ² krit = ${fmt(ck)}` },
      partEntscheidung(sig),
      { frage: "Berechnen Sie Cramérs V als Effektstärke.", punkte: 2, art: "zahl", felder: [{ label: "V", wert: V, tol: 0.02 }], loesung: `V = √(χ²/(N · (min(Zeilen, Spalten) − 1))) = ${fmt(V)}` },
      laie(2, sig ? "Die beiden Merkmale hängen bedeutsam zusammen – die Verteilung ist nicht zufällig." : "Zwischen den Merkmalen zeigt sich kein bedeutsamer Zusammenhang."),
    ],
  };
}

/* ---------- Generatoren deskriptive Statistik ---------- */
function genLage() {
  const ctx = pick([["Anzahl gelesener Bücher im letzten Jahr", 6, 3], ["Wartezeit auf einen Therapieplatz (Wochen)", 14, 5], ["Punkte in einem Konzentrationstest", 35, 8]]);
  const n = ri(7, 9), X = genData(n, ctx[1], ctx[2], 0, 1e9);
  const m = mean(X), sorted = [...X].sort((a, b) => a - b), med = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const qs = qsum(X), v = qs / n, sd = Math.sqrt(v), sw = sorted[n - 1] - sorted[0];
  return {
    typ: "rechnen", thema: "Lage- und Streuungsmaße", punkte: 18,
    material: `Bei ${n} Personen wurde die Variable „${ctx[0]}“ erhoben. Die Rohwerte lauten:`,
    tabelle: { kopf: X.map((_, i) => `P${i + 1}`), zeilen: [X] },
    gegeben: "Varianz wie in der Vorlesung als mittleres Abweichungsquadrat (Division durch n).",
    teile: [
      { frage: "Welches Skalenniveau hat die Variable?", punkte: 1, art: "wahl", optionen: ["nominal", "ordinal", "intervall-/verhältnisskaliert"], richtig: 2, loesung: "Metrisch (Verhältnisskala mit echtem Nullpunkt)." },
      { frage: "Berechnen Sie arithmetisches Mittel und Median.", punkte: 5, art: "zahl", felder: [{ label: "x̄", wert: m }, { label: "Median", wert: med, tol: 0.01 }], loesung: `x̄ = ${sum(X)}/${n} = ${fmt(m)} // sortiert: ${sorted.join(", ")} → Median = ${fmt(med)}` },
      { frage: "Berechnen Sie Spannweite, Varianz und Standardabweichung.", punkte: 8, art: "zahl", felder: [{ label: "Spannweite", wert: sw, tol: 0 }, { label: "Varianz s²", wert: v }, { label: "Standardabweichung s", wert: sd }], loesung: `Spannweite = ${sorted[n - 1]} − ${sorted[0]} = ${sw} // QS = ${fmt(qs)} → s² = QS/n = ${fmt(v)} // s = ${fmt(sd)}` },
      { frage: "Vergleichen Sie Mittelwert und Median: Was sagt das über die Verteilungsform?", punkte: 4, art: "text", loesung: m > med + 0.3 ? "x̄ > Median → rechtsschiefe (linkssteile) Verteilung." : m < med - 0.3 ? "x̄ < Median → linksschiefe (rechtssteile) Verteilung." : "x̄ ≈ Median → annähernd symmetrische Verteilung.",
        kriterien: [{ text: "Vergleich x̄ vs. Median korrekt", punkte: 2, stichworte: ["größer", "kleiner", "gleich", "ähnlich", "ungefähr"] }, { text: "Verteilungsform korrekt benannt", punkte: 2, stichworte: m > med + 0.3 ? ["rechtsschief", "linkssteil"] : m < med - 0.3 ? ["linksschief", "rechtssteil"] : ["symmetr"] }] },
    ],
  };
}
function genZ() {
  const t = pick([["Intelligenztest", 100, 15], ["Depressionsfragebogen", 20, 6], ["Konzentrationstest", 50, 10]]);
  const x1 = Math.round(t[1] + t[2] * (R() * 3 - 1.5)), m2 = ri(8, 14) * 5, s2 = ri(2, 4) * 5, x2 = Math.round(m2 + s2 * (R() * 3 - 1.5));
  const z1 = (x1 - t[1]) / t[2], z2 = (x2 - m2) / s2, T1 = 50 + 10 * z1;
  return {
    typ: "rechnen", thema: "z-Standardisierung", punkte: 12,
    material: `Person A erreicht im ${t[0]} (x̄ = ${t[1]}, s = ${t[2]}) einen Wert von ${x1}. Person B erreicht in einem anderen Test (x̄ = ${m2}, s = ${s2}) einen Wert von ${x2}.`,
    teile: [
      { frage: "Berechnen Sie die z-Werte beider Personen.", punkte: 4, art: "zahl", felder: [{ label: "z(A)", wert: z1 }, { label: "z(B)", wert: z2 }], loesung: `z = (x − x̄)/s // z(A) = (${x1} − ${t[1]})/${t[2]} = ${fmt(z1)} // z(B) = (${x2} − ${m2})/${s2} = ${fmt(z2)}` },
      { frage: "Welche Person hat relativ zu ihrer Bezugsgruppe besser abgeschnitten?", punkte: 2, art: "wahl", optionen: ["Person A", "Person B", "beide gleich"], richtig: Math.abs(z1 - z2) < 0.01 ? 2 : z1 > z2 ? 0 : 1, loesung: "Der höhere z-Wert zeigt die relativ bessere Position." },
      { frage: "Rechnen Sie den Wert von Person A in einen T-Wert um (MW = 50, s = 10).", punkte: 3, art: "zahl", felder: [{ label: "T(A)", wert: T1, tol: 0.1 }], loesung: `T = 50 + 10 · z = ${fmt(T1)}` },
      { frage: "Interpretieren Sie den z-Wert von Person A.", punkte: 3, art: "text", loesung: `Person A liegt ${fmt(Math.abs(z1))} Standardabweichungen ${z1 >= 0 ? "über" : "unter"} dem Mittelwert ihrer Bezugsgruppe.`,
        kriterien: [{ text: "Standardabweichungen als Einheit", punkte: 2, stichworte: ["standardabweich", "streuung"] }, { text: "Richtung über/unter dem Mittelwert", punkte: 1, stichworte: [z1 >= 0 ? "über" : "unter", z1 >= 0 ? "oberhalb" : "unterhalb"] }] },
    ],
  };
}
function genQuartil() {
  const n = pick([9, 11, 13]), X = genData(n, 20, 6, 0, 60).sort((a, b) => a - b);
  const q = (p) => { const pos = (n + 1) * p - 1; const lo = Math.floor(pos), f = pos - lo; return X[lo] + f * ((X[lo + 1] ?? X[lo]) - X[lo]); };
  const Q1 = q(0.25), Md = q(0.5), Q3 = q(0.75), IQR = Q3 - Q1, ug = Q1 - 1.5 * IQR, og = Q3 + 1.5 * IQR;
  return {
    typ: "rechnen", thema: "Quartile und Boxplot", punkte: 14,
    material: `Die Anzahl der Fehltage von ${n} Beschäftigten (bereits sortiert):`,
    tabelle: { kopf: X.map((_, i) => `${i + 1}`), zeilen: [X] },
    gegeben: "Quartile über die Position (n + 1) · p bestimmen.",
    teile: [
      { frage: "Bestimmen Sie Q1, Median und Q3.", punkte: 6, art: "zahl", felder: [{ label: "Q1", wert: Q1, tol: 0.5 }, { label: "Median", wert: Md, tol: 0.01 }, { label: "Q3", wert: Q3, tol: 0.5 }], loesung: `Q1 = ${fmt(Q1)} · Median = ${fmt(Md)} · Q3 = ${fmt(Q3)}` },
      { frage: "Berechnen Sie den Interquartilsabstand und die Ausreißergrenzen (1,5 · IQR).", punkte: 5, art: "zahl", felder: [{ label: "IQR", wert: IQR, tol: 0.5 }, { label: "untere Grenze", wert: ug, tol: 0.8 }, { label: "obere Grenze", wert: og, tol: 0.8 }], loesung: `IQR = Q3 − Q1 = ${fmt(IQR)} // Grenzen: Q1 − 1,5·IQR = ${fmt(ug)} · Q3 + 1,5·IQR = ${fmt(og)}` },
      { frage: "Gibt es Ausreißer?", punkte: 3, art: "wahl", optionen: ["ja", "nein"], richtig: X.some((x) => x < ug || x > og) ? 0 : 1, loesung: X.some((x) => x < ug || x > og) ? `Ja: ${X.filter((x) => x < ug || x > og).join(", ")}` : "Nein, alle Werte liegen innerhalb der Grenzen." },
    ],
  };
}

export const GENERATORS = {
  "s2-inferenzstatistik": [genTUnabh, genTAbh, genKorr, genFisher, genAnova, genRm, genReg, genChi],
  "s1-deskriptive-statistik-wahrscheinlichkeit": [genLage, genZ, genQuartil],
};
