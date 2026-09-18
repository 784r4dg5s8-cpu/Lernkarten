# Lernkarten

Karteikarten fürs Psychologie-Studium (Hochschule Fresenius). Statische Web-App, läuft auf GitHub Pages, lässt sich auf dem iPhone zum Home-Bildschirm hinzufügen.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `quellen/*.txt` | **Die Karten** – ein Fach pro Datei, von Hand pflegbar |
| `quellen/*.json` | übernommene Karten aus früheren Lern-Apps |
| `cards/` | daraus erzeugt (nicht von Hand ändern) |
| `tools/build_cards.py` | erzeugt `cards/` aus `quellen/` |
| `index.html`, `app.js`, `style.css` | die App |
| `sync.js`, `config.js`, `supabase/schema.sql` | optionaler Sync über Supabase |

## Karten ergänzen

```
@semester 3
@fach Entwicklungspsychologie
@kurz Entwicklung
## Piaget
Was ist Assimilation? || Neue Information wird ins bestehende Schema eingepasst.
!Prüfungsrelevante Frage? || Antwort // zweite Zeile
```

`!` am Zeilenanfang = prüfungsrelevant, ` // ` = Zeilenumbruch in der Antwort. Danach:

```
python3 tools/build_cards.py
```

Die Kartennummer (`id`) ergibt sich aus Fach + Frage. Wer eine Frage umformuliert, erzeugt eine neue Karte (Lernstand der alten verfällt) – Antworten dürfen beliebig geändert werden.

## Veröffentlichen

GitHub → Repo → Settings → Pages → Source: *Deploy from a branch*, Branch `main`, Ordner `/ (root)`. Danach reicht jeder Push.

## Supabase (optional, für Sync und Teilen)

1. Projekt anlegen (Region Frankfurt).
2. SQL Editor → Inhalt von `supabase/schema.sql` ausführen.
3. Authentication → URL Configuration → Site URL = Adresse der GitHub-Pages-Seite.
4. Project Settings → API: URL und `anon`-Key in `config.js` eintragen.
5. Für den Wach-halten-Ping dieselben zwei Werte als Repo-Secrets `SUPABASE_URL` und `SUPABASE_ANON_KEY` hinterlegen.
6. In `datenschutz.html` die Kontaktadresse eintragen.
