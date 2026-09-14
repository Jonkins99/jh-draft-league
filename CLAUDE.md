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

Es gibt keinen Linter/Formatter und keinen Test-Runner. `test-scoring.mjs` nutzt einen eigenen `test(name, fn)`-Helper ohne Filter-Option — einzelne Fälle lassen sich nur durch Auskommentieren isolieren. Getestet werden die framework-freien Module: `scoring.mjs`, `awards.mjs`, `trainers.mjs`, `damagecalc.mjs`, `press.mjs`, `press-context.mjs`, `press-prompts.mjs`, `auth.mjs`, `notes.mjs`, `ceremony.mjs`, `finale.mjs`. Die Anmelde-Tests rechnen asynchron (WebCrypto) und laufen über den `atest`-Helfer.

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
| `press` (Collection) | Presse-Beiträge (Spielberichte, News, Klatsch, Redaktion) inkl. Storylines |
| `pressSessions` (Collection) | Interviews und Pressekonferenzen: Rolle, Fragen, Antworten, Status |
| `settings/press` | Die über das Zahnrad änderbaren Redaktionsaufträge (Prompts) |
| `users` (Collection) | Doc-ID `janik`/`henrik`: `{player, auth:{algo,iterations,salt,hash}, enc:{algo,iterations,salt}}` — Anmeldung |
| `private` (Collection) | Doc-ID `<user>-<scope>`: `{owner, scope, payload:{v,algo,iv,ct}, updatedAt}` — AES-GCM-verschlüsselt, Scopes `notes` und `teambuilder` |
| `battleLogs` (Collection) | Doc-ID = Match-ID: `{matchId, day, home, away, entries:{<Spieler>:{text,updatedAt}}}` — geteilter Kampfverlauf |
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

**Zugang.** Anmeldung über `auth.mjs` + `Alpine.store('auth')`: genau zwei hart verdrahtete Konten (Janik, Henrik). Beim ersten Login wird ein Passwort gesetzt (PBKDF2-SHA256, 210k Runden, Salt je Konto); in `users/<id>` liegt nur die Prüfsumme. Die Gerätesitzung (`jhdl-auth-v1`) hält Spieler, Prüfsumme und den abgeleiteten Datenschlüssel; ein Passwortwechsel entwertet sie automatisch.
- **Die Anmeldung ist die Quelle für „wer bin ich".** Draft und Transfer lassen nur den Teambesitzer ziehen (`isMyTurn`), `Alpine.store('awards').me` ist ein Getter auf `auth.player`, Presse-Termine und Trainerwechsel prüfen `ownsTeam`.
- **Vertraulichkeit entsteht über den Inhalt, nicht über Regeln.** Die Firestore-Regeln bleiben offen; alles Private wird clientseitig mit AES-GCM unter einem Schlüssel verschlüsselt, der ausschließlich aus dem Passwort stammt (`encryptJson`/`decryptJson`). Ohne Passwort steht in der Datenbank nur Chiffrat.
- Die Regeln müssen für `users`, `private` und `battleLogs` freigeschaltet sein — sonst ist keine Anmeldung möglich.

**Notizen** (`notes.mjs`). Zwei Sorten, bewusst unterschiedlich: **privat** (Freitext zu Teams und Matches, verschlüsselt unter `private/<user>-notes`) und **geteilt** (der Kampfverlauf je Match in `battleLogs`, je Spieler ein Abschnitt, beide lesen beides). Der Kampfverlauf geht als eigener Block in die Presse-Metadaten ein.
- `battleLogMixin()` in `main.js` wird von `scheduleView` und `teambuildingView` eingebunden: Editor, Speichern und die Sprachaufnahme. Aufgenommen wird in beliebig vielen Schnipseln (MediaRecorder), übermittelt wird **einmal** — alle Clips gehen als `inlineData`-Teile in einen Gemini-Aufruf, zusammen mit einer Vokabelliste aus beiden Kadern (`spokenVocabulary`), damit Eigennamen stimmen.

**Saison-Abschluss** (`finale.mjs` + `finale.css`). `buildFinaleScript()` macht aus dem Liga-Zustand ein Drehbuch (Intro → Teams von unten nach oben → Pokal → Abspann), `runFinale()` spielt es ab. Start über `seasonFinaleMixin()` aus Spielplan und Tabelle, sobald jede geplante Partie drei fertige Kämpfe hat; beliebig wiederholbar. Deko (Lichtstrahlen, Goldschein) liegt im Bühnenhintergrund, **nicht** in der Szene — sonst bläht sie den Scrollbereich auf.

**Gerätelokaler Zustand** liegt konsequent in localStorage unter `jhdl-*`-Keys (Spalteneinstellungen, Speed-/Weakness-Filter, Matchup-Markierungen, Teambuilder-Notizen und -Movesets, Schadensrechner-Eingaben je Paarung, Elo-Cache, Anmeldung). Die Keys sind oben in `main.js` gebündelt. Ausnahme ist der Teambuilder-Sync: `Alpine.store('tbsync')` spiegelt genau die Schlüssel unter `SYNC_PREFIXES` verschlüsselt nach `private/<user>-teambuilder`; `saveJson` meldet jede Änderung über `syncHook`.

**Presse.** Vier Module: `press.mjs` (Kategorien, Redaktionspool, Slot-Planung, Storylines, Sanitizer), `press-context.mjs` (Liga-Zustand → Metadaten-JSON), `press-prompts.mjs` (Systeminstruktion, Kanon-Regeln, Regie, die sechs änderbaren Aufträge, Antwortschemata) und `gemini.mjs` (ein `fetch` gegen die Gemini Developer API, kein SDK). Alle vier sind framework-frei und unter Node testbar.
- **Rubriken sind mehrfach.** `article.category` ist die Hauptrubrik, `article.categories[]` hält alle (`categoriesOf`, `normalizeCategories`). „Erste Liga" (`AI_CATEGORY`) setzt `_articleDoc` automatisch auf jeden KI-Beitrag; „Zweite Liga", „Gerüchte" und „Informationen" werden im Editor vergeben.
- **Drei Zufallsbeiträge je Spieltag** (`RANDOM_ARTICLES_PER_DAY`, ID `s1-rand-d<day>-<n>`) entstehen mit dem 1., 2. und 3. abgeschlossenen Spiel eines Spieltags — nacheinander, nicht parallel, sonst schreiben drei Aufrufe dieselbe Geschichte.
- **Kanon:** Die KI darf Transfers, Sperren, Trainerwechsel und Ergebnisse **nie als Tatsache** behaupten — nur als Gerücht, Forderung oder Spekulation. Fakten stammen ausschließlich aus dem Metadatenblock. Diese Regeln stecken fest in `CANON_RULES` und gelten zusätzlich zum änderbaren Auftrag.
- **Storylines** haben keine eigene Collection: jeder Beitrag trägt die Stränge, die er fortschreibt, bei sich; der Stand ist der jüngste Beitrag, der einen Strang erwähnt (`collectStorylines`).
- **Spielberichte** entstehen automatisch beim Übergang „Match wird vollständig". Der Auslöser ist die beobachtete Änderung, nicht der Bestand (`pressSeenComplete` liegt bewusst außerhalb der Alpine-Reaktivität); der Platz wird per `runTransaction` belegt, damit zwei offene Geräte nicht doppelt schreiben.
- **Termine:** je Team und Spieltag ein Interview und eine Pressekonferenz, die Verteilung auf „vor/nach dem Spiel" wird deterministisch aus `teamId + day` gelost (kein Schreibzugriff, auf jedem Gerät gleich). Davor liegt einmalig die Auftaktrunde (`BONUS_ROUND_DAY`); Pressebetrieb beginnt mit `PRESS_FROM_DAY`.
- **Der API-Key liegt gerätelokal** (`jhdl-press-key-v1`) und darf nie nach Firestore. Ohne Key bleibt die Ansicht bedienbar, es entstehen nur keine neuen Beiträge.
- **Zwei Schlüsselformate:** `AIza…` geht in den Header `x-goog-api-key`, `AQ.…` (seit 2026 das einzige, das AI Studio ausgibt) in `Authorization: Bearer`. `gemini.mjs` wählt nach Präfix und probiert bei 401 automatisch das andere Verfahren.
- **Denksteuerung ist modellabhängig:** die 3er-Generation nimmt `thinkingLevel`, die 2.5er ein `thinkingBudget` — beides zusammen ist ein Fehler. Denk-Tokens zählen gegen `maxOutputTokens`; ohne Deckel kommt die Antwort leer mit `MAX_TOKENS` zurück. Gemini 3 läuft ausdrücklich auf Temperatur 1.0.
- `<select>` mit `<template x-for>`-Optionen: x-model setzt den Startwert, bevor die Optionen im DOM stehen. Die Vorauswahl deshalb über `:selected` am `<option>` lösen, nicht nachträglich per JS.

**Siegerehrung** (`ceremony.mjs` + `awards.css`). Fünf Inszenierungen (`CEREMONY_VARIANTS`) teilen sich denselben Ablauf und werden je Ehrung zufällig gewählt (`pickCeremonyVariant`); sie unterscheiden sich nur in Tempo (`timing`), Enthüllungsgeste (CSS unter `.cer-stage[data-variant="…"]`) und Schlusseffekt (`burst`). `awards-entwurf.html` kann eine Variante zum Ansehen erzwingen.

**Trainer** (`teams/<id>.trainers`) sind eine eigene Position: kein Kampf, kein Draft, keine Statistik, nur im Team-View. Amtszeiten werden in Spieltagen geführt — `fromDay: null` heißt „vor der Saison", `untilDay: null` heißt „amtierend". Logik in `trainers.mjs`, Schreibzugriffe über `appointTrainer` / `updateTrainer` / `dismissTrainer` im league-Store.

## Konventionen & Fallen

- `docs/` ist Build-Output und wird bei jedem Build geleert — dort niemals editieren.
- `vite.config.js` setzt `base: './'` für GitHub Pages; keine absoluten Asset-Pfade einführen.
- Änderungen werden dem Projektinhaber als Zip nur der geänderten Quelldateien übergeben (ohne `docs/`); bei neuen npm-Abhängigkeiten `package.json` und `package-lock.json` mitgeben. Git-Operationen sind hier absolut tabu.
- `CHANGELOG.md` dokumentiert Features feature-weise (Englisch) und ist die beste Quelle für die Historie einer Ansicht.
- UI setzt native Plattform-Features ein (Popover-API, `@starting-style`, View Transitions, Container Queries) statt JS-Bibliotheken — bei neuen Overlays diesem Muster folgen.
- Jede Umsetzung muss tadellos mobilfreundlich umgesetzt sein
- Mixins werden per Spread eingesetzt (`{ ...mixin() }`). **Spread wertet Getter aus** und kopiert nur deren Ergebnis — in einem Mixin gehört alles Veränderliche deshalb in eine Methode, nicht in einen Getter (siehe `damageCalcMixin`).