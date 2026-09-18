#!/usr/bin/env python3
"""Baut cards/*.json und cards/index.json aus quellen/*.txt.

Format einer Quelldatei:
  @semester 3
  @fach Name des Fachs
  @kurz Kürzel
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
def deck(sem, fach, kurz):
    key = f"s{sem}-{slug(fach)}"
    if key not in decks:
        decks[key] = {"id": key, "semester": int(sem), "fach": fach, "kurz": kurz or fach, "cards": []}
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
            topic = line[3:].strip(); continue
        if "||" not in line:
            raise SystemExit(f"{f.name}:{n}: fehlt '||'")
        d = d or deck(meta["semester"], meta["fach"], meta.get("kurz"))
        imp = line.startswith("!")
        q, a = [x.strip() for x in line.lstrip("!").split("||", 1)]
        a = "\n".join(p.strip() for p in a.split(" // "))
        d["cards"].append({"id": cid(d["fach"], q), "topic": topic, "q": q, "a": a, **({"exam": True} if imp else {})})

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
                  "count": len(cards), "topics": topics, "file": f"cards/{key}.json"})
(OUT / "index.json").write_text(json.dumps({"decks": index}, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(index)} Fächer, {sum(i['count'] for i in index)} Karten")
for i in index:
    print(f"  S{i['semester']} {i['fach']}: {i['count']}")
