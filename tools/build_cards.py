#!/usr/bin/env python3
"""Baut cards/*.json und cards/index.json aus quellen/*.txt.

Format einer Quelldatei:
  @semester 3
  @fach Name des Fachs
  @kurz Kürzel
  @dozent Name (optional)
  @pruefung Klausur|Hausarbeit|unbekannt, @format Text, @markierung belegt|kern, @quelle Text (optional)
Probeklausur-Pools liegen in exams/<deckId>.json.
  ## Thema
  Frage || Antwort          (" // " in der Antwort = Zeilenumbruch)
  !Frage || Antwort         (! = prüfungsrelevant)
Zusätzlich werden quellen/*.json (fertige Kartenlisten) übernommen.
"""
import json, re, hashlib, pathlib, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "quellen", ROOT / "cards"

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def cid(fach, q):
    return hashlib.sha1((fach + "|" + q.strip().lower()).encode()).hexdigest()[:10]

decks = {}
EXTRA = ("dozent", "pruefung", "format", "markierung", "quelle")
def deck(sem, fach, kurz, meta=None):
    key = f"s{sem}-{slug(fach)}"
    if key not in decks:
        decks[key] = {"id": key, "semester": int(sem), "fach": fach, "kurz": kurz or fach, "cards": []}
    for k in EXTRA:
        if meta and meta.get(k):
            decks[key][k] = meta[k]
    return decks[key]

for f in sorted(SRC.glob("*.txt")):
    meta, topic, d = {}, "Allgemein", None
    for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("%"):
            continue
        if line.startswith("@"):
            k, _, v = line[1:].partition(" ")
            meta[k] = v.strip()
            continue
        if line.startswith("## "):
            d = d or deck(meta["semester"], meta["fach"], meta.get("kurz"), meta)
            topic = line[3:].strip(); continue
        if "||" not in line:
            raise SystemExit(f"{f.name}:{n}: fehlt '||'")
        d = d or deck(meta["semester"], meta["fach"], meta.get("kurz"), meta)
        imp = line.startswith("!")
        q, a = [x.strip() for x in line.lstrip("!").split("||", 1)]
        a = "\n".join(p.strip() for p in a.split(" // "))
        d["cards"].append({"id": cid(d["fach"], q), "topic": topic, "q": q, "a": a, **({"exam": True} if imp else {})})

    if d is None and "fach" in meta:
        deck(meta["semester"], meta["fach"], meta.get("kurz"), meta)

for f in sorted(SRC.glob("*.json")):
    data = json.loads(f.read_text(encoding="utf-8"))
    d = deck(data["semester"], data["fach"], data.get("kurz"))
    for c in data["cards"]:
        d["cards"].append({"id": cid(d["fach"], c["q"]), "topic": c.get("topic") or "Allgemein",
                           "q": c["q"].strip(), "a": c["a"].strip(), **({"exam": True} if c.get("exam") else {})})

OUT.mkdir(exist_ok=True)
for old in OUT.glob("*.json"):
    old.unlink()
index = []
for key, d in sorted(decks.items(), key=lambda kv: (kv[1]["semester"], kv[1]["fach"])):
    seen, cards = set(), []
    for c in d["cards"]:
        if c["id"] in seen:
            continue
        seen.add(c["id"]); cards.append(c)
    d["cards"] = cards
    (OUT / f"{key}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    topics = list(dict.fromkeys(c["topic"] for c in cards))
    index.append({"id": key, "semester": d["semester"], "fach": d["fach"], "kurz": d["kurz"],
                  "count": len(cards), **{k: d[k] for k in EXTRA if d.get(k)}, "topics": topics, "file": f"cards/{key}.json"})
# Probeklausur-Pools übernehmen
EX = ROOT / "exams"
for i in index:
    i["exam"] = (EX / f"{i['id']}.json").exists()
(OUT / "index.json").write_text(json.dumps({"decks": index}, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(index)} Fächer, {sum(i['count'] for i in index)} Karten")
for i in index:
    print(f"  S{i['semester']} {i['fach']}: {i['count']}")

# Cache-Busting: Versionsnummer in index.html/app.js hochsetzen, damit Browser keine alten Dateien mischen
import time
ver = time.strftime("%Y%m%d%H%M")
for name in ("index.html", "app.js", "exam.js"):
    p = ROOT / name
    t = p.read_text(encoding="utf-8")
    t2 = re.sub(r"\?v=\w+", "?v=" + ver, t)
    if t2 != t:
        p.write_text(t2, encoding="utf-8")
print("Version", ver)
