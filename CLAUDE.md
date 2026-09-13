# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

„JH Draft League" — private Pokémon-Draft-Liga (Janik vs. Henrik, je 4 Teams). Statische Vite-SPA mit Alpine.js, Tailwind v4 und Firestore als Live-Datenbank. Deployment: GitHub Pages aus dem `docs/`-Ordner. UI-Texte und Code-Kommentare sind auf Deutsch.
Die Kommunikation zwischen Claude und dem Nutzer findet nicht in der Konsole statt. Die zu erledigenden Aufgaben liegen in /tasks mit eindeutigen Aufträgen. Es sind alle Aufträge abzuarbeiten, die in /tasks liegen und jeweils eigene Dateien haben, welche noch nicht umgesetzt wurden. Claude soll Entscheidungen auf sinnvolle Arten und Weisen selbst treffen nachdem es den Auftrag erhalten hat, dass es loslegen soll. Nur wenn es absolut notwendig ist eine kritische Frage an den Nutzer weiterzugeben, soll eine Nachfrage gestellt werden - aber auch dann nicht über das Terminal, sondern indem die Frage am Ende der Datei mit der tasks ergänzt wird. Im Terminal sind jede Form von Textausgaben durch Claude ABSOLUT UNTERSAGT - auch zum Abschluss der Aufgaben.

## Commands

```bash
npm install
npm run dev          # Vite-Devserver
npm run build         # Build nach docs/ (emptyOutDir: true)
npm run preview

node scripts/test-scoring.mjs    # Logik-Tests (node:assert, kein Framework, keine Deps)
```

Es gibt keinen Linter/Formatter und keinen Test-Runner. `test-scoring.mjs` nutzt einen eigenen `test(name, fn)`-Helper ohne Filter-Option — einzelne Fälle lassen sich nur durch Auskommentieren isolieren. Getestet wird ausschließlich `resources/js/scoring.mjs`.

Firestore-Wartungsskripte (schreiben direkt in die Live-DB, Client-SDK mit der Config aus `resources/js/firebase.js`):

```bash
node scripts/seed-teams.mjs        # Teams Saison 1 anlegen (idempotent, IDs s1-<slug>)
node scripts/reset-draft.mjs       # Draft -> idle, Roster leeren
node scripts/reset-season.mjs      # zusätzlich Spielplan + alle Ergebnisse löschen
node scripts/reset-transfer.mjs    # Wintertransfer zurücksetzen
node scripts/simulate-draft.mjs    # regelkonformen Draft simulieren (danach reset-draft)
node scripts/seed-trainers.mjs    # Trainer-Startdatensatz aus scripts/data/trainers.csv schreiben (merge auf teams/<id>.trainers)
```

Skripte ohne Firestore-Zugriff:

```bash
node scripts/build-i18n-de.mjs      # deutsche Attacken-/Fähigkeits-/Item-Namen -> public/data/i18n-de.json (holt PokeAPI-CSVs)
node scripts/check-calc-species.mjs # prüft, ob jeder Eintrag aus pokemon.json eine @smogon/calc-Spezies trifft
```

## Architektur

**Partial-SPA ohne Router.** `index.html` enthält Shell (Sidebar, Mobile-Nav, Suche, Toasts, Info-Popover, Zurück-Leiste). Views sind rohe HTML-Fragmente in `public/pages/*.html`; `app().load(key)` in `resources/js/main.js` holt sie per `fetch`, schreibt sie in `$refs.view` und ruft `Alpine.initTree(view)`. Übergänge laufen über `document.startViewTransition`.

**Kein URL-Routing, aber ein Verlauf.** Jeder Ansichtswechsel legt über `history.pushState` einen Eintrag mit **unveränderter URL** an (`app()._stack` hält parallel die Beschriftungen). Damit funktionieren der Browser-Zurück-Knopf und die globale Zurück-Leiste, ohne dass es Deep-Links, ein Hash-Schema oder ein Server-Rewrite bräuchte. Ein Reload startet weiterhin über `startKey()`. `Alpine.store('nav').canBack` spiegelt den Stack für einzelne Views.

Konsequenzen beim Anlegen einer neuen View:
1. Partial nach `public/pages/` (muss in `public/`, damit es zur Laufzeit fetchbar bleibt).
2. Route in `app().items` bzw. `app().routes` ergänzen (`items` ist gleichzeitig die Sidebar: feste Relevanz-Reihenfolge, „Transfer" erst nach abgeschlossenem Draft, ein laufender Draft bzw. Transfer rückt auf Position 1; `pokemon` ist eine versteckte Detail-Route).
3. Alpine-Komponente unten in `main.js` per `Alpine.data(...)` registrieren — Partials referenzieren sie als `x-data="viewName"` ohne Klammern.
4. Bei neuen Template-Pfaden die `@source`-Direktiven in `resources/css/style.css` erweitern (Tailwind v4 ist CSS-first konfiguriert, kein `tailwind.config.js`; Theme-Tokens stehen im `@theme`-Block).

**Navigation zwischen Views** läuft über `Alpine.store('nav')` als Übergabepuffer: Absender dispatcht `navigate` mit `teamId`/`matchId`/`pokemonName`/`teamAId`/`teamBId`, die Ziel-View liest den Store in ihrem `init()` und räumt ihn auf.

**Daten.** `Alpine.store('league')` (`main.js`, ab ~Z. 2458) ist die einzige Datenquelle: fünf `onSnapshot`-Listener plus ein Fetch, jeweils mit `*Loaded`-Flag für Ladezustände in den Views. Schreibzugriffe laufen ausschließlich über Store-Methoden (`pick`, `saveResult`, `startDraft`, `generateSchedule`, `transferRemove/Skip/Pick`) und nutzen `writeBatch`, damit Roster-Update und `pickIndex` atomar bleiben.

| Quelle | Inhalt |
|---|---|
| `teams` (Collection) | `{season, name, player, logo, order, pokemon: [...], trainers: [...]}` — Roster und Trainer inline im Team-Doc |
| `drafts/s1` | `{status: idle\|running\|done, order, pickIndex}` |
| `drafts/transfer-s1` | Wintertransfer, zusätzlich `removed[]`, `added[]` |
| `schedules/s1` | `{matchdays: [{day, matches: [{home, away}]}]}` |
| `results` (Collection) | Doc-ID `s1-d<day>-m<index>`, siehe unten |
| `public/data/pokemon.json` | einzige Pokémon-Stammdatenquelle (`name`, `name_en`, `dex`, `types`, `tier`, `cost`, `image`, `base_speed`); Namen sind global eindeutig und dienen als Fremdschlüssel |
| `public/data/i18n-de.json` | deutsche Namen für Attacken, Fähigkeiten und Items (nur der Schadensrechner); generiert, nicht von Hand pflegen |

Ein `results`-Doc: `{home, away, day, squads: {home: [names], away: [names]}, battles: [{done, used: {home, away}, score: {home, away}, winner, kills: [{victimSide, victim, killerSide, killer}]}]}`.

**Liga-Logik ist framework-frei.** `resources/js/scoring.mjs` (und `elo.mjs`, `export.mjs`, `awards.mjs`, `trainers.mjs`, `damagecalc.mjs`) importieren weder Alpine noch Firebase — deshalb sind sie unter Node testbar. Neue Berechnungen gehören dorthin, nicht in die View-Komponenten.

**Schadensrechner.** `damagecalc.mjs` ist nur die Brücke (Speziesnamen, SP↔EV, Wesen, Moveset-Felder, Ergebnisaufbereitung); gerechnet wird mit `@smogon/calc`, das zusammen mit `i18n-de.json` **erst beim Öffnen des Rechners dynamisch nachgeladen** wird — nie statisch importieren, sonst wächst das Start-Bundle um ~110 kB gzip. Champions-Eigenheiten: Format fest auf Generation 9 / `gameType: 'Doubles'`, und Statuspunkte statt EVs — 1 SP = 8 EV bildet die Champions-Werte über den gesamten Bereich exakt ab (Test vergleicht alle Kombinationen gegen `speedAt()`).

**Zentrale Regeln in `scoring.mjs`** (nicht umdeuten):
- Ein Match besteht aus 3 Kämpfen; 6 von 10 Roster-Pokémon bilden das Aufgebot (`squads`), 4 davon spielen je Kampf (`used`).
- Sieger, Ergebnis und Kill-Log sind **entkoppelt**: `b.winner` (`home|away|draw`) bestimmt die Punkte und wird explizit gesetzt (Fallback für Alt-Daten: mehr Überlebende gewinnt); `score` sind frei eintragbare Überlebende (0–4 je Seite); Kills/Deaths stammen **ausschließlich** aus `b.kills`. Ein als „überlebt" gewertetes Pokémon bekommt nie einen Death.
- Kills zählen nur gegen die Gegenseite (kein Self-Kill), Deaths zählen immer — auch durch Partner oder ohne Verursacher.
- Nur Kämpfe mit `done === true` zählen.
- Statistik-Attribution ist **result-getrieben**: ein Beitrag zählt für die Seite, die das Pokémon in *diesem* Ergebnis aufgestellt hat, nicht für den aktuellen Roster-Besitzer (nötig wegen Wintertransfer). `opts.scopeTeamId` schränkt auf die Team-Detailsicht ein; im Liga-Ranking bleiben abgegebene Pokémon mit `team: null` gelistet.
- Speed-Berechnung folgt „Pokémon Champions" (Level 50, IV 31, SP statt EVs, max. 32 SP) — nicht durch die klassische EV-Formel ersetzen.

**Statistik-Katalog.** `STAT_CATALOG` in `main.js` definiert Label, Kurzform, Format und Erklärtext jeder Pokémon-Kennzahl an einer Stelle; `columnsMixin(storageKey)` liefert Spaltenwahl, Reihenfolge (Drag & Drop), Sortierung und Tabelle/Karten-Modus als wiederverwendbares Mixin. Eine neue Kennzahl wird in `withDerivedStats` berechnet und im Katalog registriert — damit erscheint sie automatisch in beiden Ranking-Tabellen und den Info-Popovers.

**Elo-Prognose.** `elo.mjs` liest ein öffentliches Google Sheet clientseitig über den gviz-Endpoint (kein API-Key, kein Proxy), Cache in localStorage, manueller Refresh über `Alpine.store('elo')`. Das Sheet muss link-öffentlich („Betrachter") bleiben. Der Service-Account-Key (`sheets-api-*.json`) wird bewusst **nicht** ausgeliefert und darf nicht in den Build gelangen.

**Zugang.** Clientseitiges Passwort-Gate: SHA-256-Vergleich gegen `ACCESS_HASH` in `main.js`, Freischaltung in localStorage. Firestore-Regeln sind offen (read/write) — das Gate ist Bequemlichkeit, kein Schutz.

**Gerätelokaler Zustand** liegt konsequent in localStorage unter `jhdl-*`-Keys (Spalteneinstellungen, Speed-/Weakness-Filter, Matchup-Markierungen, Teambuilder-Notizen und -Movesets, Schadensrechner-Eingaben je Paarung, Elo-Cache) und wird nie nach Firestore geschrieben. Die Keys sind oben in `main.js` gebündelt.

**Trainer** (`teams/<id>.trainers`) sind eine eigene Position: kein Kampf, kein Draft, keine Statistik, nur im Team-View. Amtszeiten werden in Spieltagen geführt — `fromDay: null` heißt „vor der Saison", `untilDay: null` heißt „amtierend". Logik in `trainers.mjs`, Schreibzugriffe über `appointTrainer` / `updateTrainer` / `dismissTrainer` im league-Store.

## Konventionen & Fallen

- `docs/` ist Build-Output und wird bei jedem Build geleert — dort niemals editieren.
- `vite.config.js` setzt `base: './'` für GitHub Pages; keine absoluten Asset-Pfade einführen.
- Änderungen werden dem Projektinhaber als Zip nur der geänderten Quelldateien übergeben (ohne `docs/`); bei neuen npm-Abhängigkeiten `package.json` und `package-lock.json` mitgeben. Git-Operationen sind hier absolut tabu.
- `CHANGELOG.md` dokumentiert Features feature-weise (Englisch) und ist die beste Quelle für die Historie einer Ansicht.
- UI setzt native Plattform-Features ein (Popover-API, `@starting-style`, View Transitions, Container Queries) statt JS-Bibliotheken — bei neuen Overlays diesem Muster folgen.
- Jede Umsetzung muss tadellos mobilfreundlich umgesetzt sein
- Mixins werden per Spread eingesetzt (`{ ...mixin() }`). **Spread wertet Getter aus** und kopiert nur deren Ergebnis — in einem Mixin gehört alles Veränderliche deshalb in eine Methode, nicht in einen Getter (siehe `damageCalcMixin`).