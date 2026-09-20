# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

„JH Draft League" — private Pokémon-Draft-Liga (Janik vs. Henrik, je 4 Teams). Statische Vite-SPA mit Alpine.js, Tailwind v4 und Firestore als Live-Datenbank. Deployment: GitHub Pages aus dem `docs/`-Ordner. UI-Texte und Code-Kommentare sind auf Deutsch.
Die Kommunikation zwischen Claude und dem Nutzer findet nicht in der Konsole statt. Die zu erledigenden Aufgaben liegen in /tasks mit eindeutigen Aufträgen. Es sind alle Aufträge abzuarbeiten, die in /tasks liegen und jeweils eigene Dateien haben, welche noch nicht umgesetzt wurden. Claude soll Entscheidungen auf sinnvolle Arten und Weisen selbst treffen nachdem es den Auftrag erhalten hat, dass es loslegen soll. Nur wenn es absolut notwendig ist eine kritische Frage an den Nutzer weiterzugeben, soll eine Nachfrage gestellt werden - aber auch dann nicht über das Terminal, sondern indem die Frage am Ende der Datei mit der tasks ergänzt wird. Im Terminal sind JEDE Form von Textausgaben durch Claude ABSOLUT UNTERSAGT - auch zum Abschluss der Aufgaben.
Tasks die fertig umgesetzt wurden sollen als Prefix in der Datei ein "z_" erhalten, damit sie nach unten sortiert werden. Neue Tasks haben kein Prefix. Aufgaben bei denen eine Frage zwingend beantwortet werden muss sollen ein a_ Prefix erhalten.

## Commands

```bash
npm install
npm run dev          # Vite-Devserver
npm run build         # Build nach docs/ (emptyOutDir: true)
npm run preview

node scripts/test-scoring.mjs    # Logik-Tests (node:assert, kein Framework, keine Deps)
```

Es gibt keinen Linter/Formatter und keinen Test-Runner. `test-scoring.mjs` nutzt einen eigenen `test(name, fn)`-Helper ohne Filter-Option — einzelne Fälle lassen sich nur durch Auskommentieren isolieren. Getestet werden die framework-freien Module: `scoring.mjs`, `awards.mjs`, `trainers.mjs`, `damagecalc.mjs`, `press.mjs`, `press-context.mjs`, `press-prompts.mjs`, `auth.mjs`, `notes.mjs`, `ceremony.mjs`, `finale.mjs`, `market.mjs`, `seasons.mjs`, `video.mjs`, `press-tiles.mjs`, `draft.mjs`, `draftplan.mjs`. Die Anmelde-Tests rechnen asynchron (WebCrypto) und laufen über den `atest`-Helfer.

Firestore-Wartungsskripte (schreiben direkt in die Live-DB, Client-SDK mit der Config aus `resources/js/firebase.js`):

```bash
node scripts/seed-teams.mjs        # Teams Saison 1 anlegen (idempotent, IDs s1-<slug>)
node scripts/reset-draft.mjs       # Draft -> idle, Roster leeren
node scripts/reset-season.mjs      # zusätzlich Spielplan + alle Ergebnisse löschen
node scripts/reset-transfer.mjs    # Wintertransfer zurücksetzen
node scripts/simulate-draft.mjs    # regelkonformen Draft simulieren (danach reset-draft)
node scripts/seed-trainers.mjs    # Trainer-Startdatensatz aus scripts/data/trainers.csv schreiben (merge auf teams/<id>.trainers)
node scripts/seed-teams.mjs --season 2     # Teams der Saison 2 aus scripts/data/teams-s2.json
node scripts/seed-trainers.mjs --season 2  # Trainer der Saison 2 aus scripts/data/trainers-s2.csv
```

Skripte ohne Firestore-Zugriff:

```bash
node scripts/build-i18n-de.mjs      # deutsche Attacken-/Fähigkeits-/Item-Namen -> public/data/i18n-de.json (holt PokeAPI-CSVs)
node scripts/check-calc-species.mjs # prüft, ob jeder Eintrag aus pokemon.json eine @smogon/calc-Spezies trifft
node scripts/apply-tiers.mjs        # Tier-Einstufung (Sheet-Spalte D) nach pokemon.json ziehen; ohne --write nur Probelauf
```

**Vor jedem Draft wird der Pool neu eingestuft.** Spalte D des Elo-Sheets hält das Tier der KOMMENDEN Saison; `apply-tiers.mjs` zieht das in `pokemon.json` nach — die einzige Tier-Quelle der Anwendung. Die Punktwerte wandern mit, behalten aber ihren Rang innerhalb des Tiers (Bänder S 20–17, A 16–13, B 12–9, C 8–5, D 4–1); sonst stünde nach einem Wechsel „Tier S · 9 Punkte" da.

## Architektur

**Saisons.** `Alpine.store('season')` hält den gewählten Bereich: eine Saisonnummer oder `'all'` (saisonübergreifend), gerätelokal unter `jhdl-season-v1`. `seasons.mjs` ist die framework-freie Logik dazu.
- **Die Saison steckt in der Dokument-ID, nicht in einem Feld** (`s1-heerashai-sv`, `s1-d3-m0`, `schedules/s1`, `drafts/s1`, `drafts/transfer-s1`, `s1-report-…`). Nur so lassen sich auch `results` zuordnen, die nie ein `season`-Feld hatten. `seasonOfId` ist überall die Quelle; `league.prefix` liefert das Präfix für Schreibzugriffe.
- **Ein Team ist über Saisons hinweg dasselbe FRANCHISE**, wenn der Namensteil der ID gleich bleibt (`franchiseSlug`). Darauf beruht die ewige Tabelle — und damit auch Auf- und Abstiege ab Saison 2.
- **Der league-Store hält immer den Gesamtbestand.** `drafts`, `schedules` und `results` kommen als ganze Collection herein (`_drafts`, `_schedules`, `allResults`); `draft`, `transfer`, `schedule`, `results` und `seasonTeams` sind Getter auf die aktive Saison. Ein Saisonwechsel braucht deshalb weder neue Listener noch einen Reload.
- **Was es saisonübergreifend gibt:** Tabelle (ewig), Statistiken, Presse, Awards (Ehrentafel), Spieler und der nur dort erreichbare View `rekorde`. Spielplan, Teambuilding, Teams, Draft und Transfer fallen weg — sie gehören immer zu genau einer Saison (`app().items`).
- **Titel zählen erst für abgeschlossene Saisons** (`seasonFinished` prüft jede geplante Partie gegen ihr Ergebnis) — der Tabellenführer einer laufenden Saison ist kein Meister.
- Kennzahlen im `STAT_CATALOG` können `scope: 'all'` tragen und erscheinen dann ausschließlich saisonübergreifend (`columnsMixin.inScope`).
- **Die Presse ist bewusst saisonübergreifend** und sieht in jedem Bereich gleich aus; geschrieben wird immer in die aktive Saison.
- **Statistik-Nenner kennen den Wintertransfer.** `transferAvailability(transfer, schedule)` liefert je `teamId|name` das Fenster, in dem ein Pokémon dem Team gehörte (Schnitt = letzter Spieltag der Hinrunde). Der league-Store bündelt das über alle Saisons in `availability` und reicht es an `pokemonStats`/`pokemonProfile`; ohne die Karte rechnet ein im Winter geholtes Pokémon so, als hätte es die Hinrunde auf der Bank verbracht.

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
| `teams` (Collection) | `{season, name, player, logo, color, order, pokemon: [...], trainers: [...]}` — Roster und Trainer inline im Team-Doc |
| `drafts/s1` | `{status: idle\|order\|running\|done, order, pickIndex, renewals[], renewalRound, renewalDone[], orderChoice}` |
| `drafts/transfer-s1` | Wintertransfer, zusätzlich `removed[]`, `added[]` |
| `schedules/s1` | `{matchdays: [{day, matches: [{home, away}]}]}` |
| `results` (Collection) | Doc-ID `s<N>-d<day>-m<index>`, siehe unten — die Saison steckt nur in der ID |
| `press` (Collection) | Presse-Beiträge (Spielberichte, News, Klatsch, Redaktion) inkl. Storylines |
| `pressSessions` (Collection) | Interviews und Pressekonferenzen: Rolle, Fragen, Antworten, Status |
| `settings/press` | Die über das Zahnrad änderbaren Redaktionsaufträge (Prompts) |
| `users` (Collection) | Doc-ID `janik`/`henrik`: `{player, auth:{algo,iterations,salt,hash}, enc:{algo,iterations,salt}}` — Anmeldung |
| `private` (Collection) | Doc-ID `<user>-<scope>`: `{owner, scope, payload:{v,algo,iv,ct}, updatedAt}` — AES-GCM-verschlüsselt, Scopes `notes` und `teambuilder` |
| `battleLogs` (Collection) | Doc-ID = Match-ID: `{matchId, day, home, away, entries:{<Spieler>:{text,updatedAt}}}` — geteilter Kampfverlauf |
| `public/data/pokemon.json` | einzige Pokémon-Stammdatenquelle (`name`, `name_en`, `dex`, `types`, `tier`, `cost`, `image`, `base_speed`, optional `since`); Namen sind global eindeutig und dienen als Fremdschlüssel. `since: N` heißt „erst zu Saison N in den Pool gekommen" und ist die Quelle für `newcomersOfSeason` und den Neuzugangs-Beitrag |
| `public/data/i18n-de.json` | deutsche Namen für Attacken, Fähigkeiten und Items (nur der Schadensrechner); generiert, nicht von Hand pflegen |

Ein `results`-Doc: `{home, away, day, squads: {home: [names], away: [names]}, battles: [{done, used: {home, away}, score: {home, away}, winner, kills: [{victimSide, victim, killerSide, killer}]}]}`. Dazu kommen `videoUrl`, `pressReady`, `pressReadyAt` und `pressReadyBy`.

**Ergebnisse werden nie roh überschrieben.** `saveResult` läuft in einer `runTransaction` und führt über `mergeResult` (`scoring.mjs`) zusammen: ein fertiger Kampf wird nie durch einen unfertigen ersetzt, ein leeres Aufgebot ersetzt kein gefülltes, und Felder, die das Formular gar nicht kennt (`videoUrl`, `pressReady`), bleiben stehen. Das war der Weg, auf dem ein veraltetes Formular (zweites Gerät, noch nicht geladene `results`) Kämpfe und Kill-Log gelöscht hat. Die Eingabe öffnet außerdem erst, wenn `resultsLoaded` gilt.

**Pressefreigabe.** `pressReady` am Ergebnis ist der Auslöser der Presse-Automatik, nicht die Vollständigkeit — `isPressReleased` statt `isMatchComplete` in `_watchResults`, `completedOnDay` und `marketDaysReady`. Wo von Hand nachgeholt wird (Wartungs-Tab), zählt weiterhin `isMatchComplete` (`{released: false}`). Freigegeben wird im Spielplan, damit Ergebnis UND Kampfverlauf final sind, bevor geschrieben wird.

**Video** (`video.mjs`). Ein Video deckt alle drei Kämpfe ab und hängt deshalb am Ergebnis (`videoUrl`). Eingebettet wird ausschließlich YouTube (`youtu.be`, `watch`, `shorts`, `live`, `embed`, mit Zeitstempel) über `youtube-nocookie.com`; alles andere bleibt ein Link — ein fremder Host im iframe ist eine Wette, die es hier nicht braucht.

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
- Spalten: Rang | Pokémon | Elo | Tier | **Verlauf ab Spalte E** („S1 Pre", „S1 Draft", „S1 MD1" … „S1 Post"). Verlaufsspalten sind **nicht** hart verdrahtet — alles ab E mit Beschriftung gilt als Zeitpunkt, leere Zellen heißen „noch nicht erreicht". Neue Spalten (S2 …) erscheinen ohne Codeänderung.

**Marktwerte** (`market.mjs`, `marketchart.mjs`, `marketshow.mjs`, `market.css`). Der Marktwert ist die Fußball-Metapher für den Elo-Wert und überall die **führende** Größe; Elo steht nur klein oder in Klammern daneben. Ausnahme sind die Statistik-Tabellen, in denen beide Werte eigene, sortierbare Spalten haben.
- **Kaderstand je Zeitpunkt:** `transferCutIndex`/`rosterAtIndex`/`rosterSpans` bestimmen, welcher Kader zu welchem Verlaufspunkt galt. Der Schnitt kommt aus der Sheet-Spalte „Transfer", ersatzweise aus dem **letzten Spieltag der Hinrunde** (`schedule.matchdays[].leg`) — das Transfer-Dokument selbst kennt keinen Spieltag. Vor dem Schnitt gilt der heutige Kader ohne `added` und mit `removed`. `squadHistory` nimmt dafür statt einer Liste auch eine Funktion `(stop, i) => names`.
- **Umrechnung:** zehn feste Stützstellen (`MARKET_ANCHORS`), dazwischen im Logarithmus linear interpoliert, danach gestuft gerundet (`roundMarketValue`). Die Stützstellen sitzen damit exakt; die Funktion ist streng monoton. Vorgaben nicht überschreiben — der Test prüft jede Stützstelle.
- **Der Verlauf gehört zu genau einer Saison.** Das Sheet führt alle Saisons in einer Zeile weiter; `limitHistory(rows, season)` schneidet ihn auf die gewählte Saison zu. Der elo-Store bietet dafür `histRows`/`histIndex`/`stops`/`stopKeys` — `index()` bleibt der heutige Stand und ist saisonunabhängig. Ohne den Schnitt liefe die abgeschlossene Kurve der Saison 1 mit dem Startwert der Saison 2 weiter.
- **Tier-Grenzen** kommen NICHT aus dieser Anwendung: `tierBoundaries(rows)` leitet sie aus dem Sheet ab (Mitte zwischen dem schwächsten Vertreter des besseren und dem stärksten des schlechteren Tiers).
- **Zwei Vergleichsarten, bewusst getrennt:** `diffSnapshots(prev, next)` vergleicht gegen die gerätelokale Momentaufnahme (`jhdl-elo-prev-v1`) — das ist die Grundlage der Update-Animation, weil das Sheet oft mitten im Spieltag nach einem einzelnen Spiel aktualisiert wird. `historyDiff(rows, stopKey)` vergleicht zwei Verlaufsspalten und ist damit gerätetunabhängig — das ist die Grundlage des Presse-Beitrags.
- **`marketchart.mjs`** zeichnet in echten CSS-Pixeln (gemessene Containerbreite + ResizeObserver), nicht in einem skalierten viewBox-Raster — nur so bleiben Schriftgrößen mobil lesbar und das Diagramm nie breiter als sein Container. Einbinden über `bindMarketChart(ctx, el, key, build)` in `main.js` (x-init), das den Beobachter je Schlüssel nur einmal registriert.
- **`marketshow.mjs`** ist die Inszenierung des Updates (Aufbau analog `ceremony.mjs`): Gesamtwert → jeder Tier-Wechsel einzeln und groß → fünf größte Gewinner und Verlierer. Es steht immer nur EIN Element im Mittelpunkt; die Bühne ist ein Grid mit fester Kopf-/Fußzeile und scrollendem Mittelteil, damit der Fokus mobil im Bild bleibt.
- **Sticky Tabellenspalten** dürfen ihre Tönung nicht über `background` bekommen (überschreibt die Grundfarbe, der Text dahinter scheint durch) — `stickyTint()` setzt sie über `background-image`. Der Scroll-Container der Marktwert-Tabelle hat bewusst keine seitliche Polsterung, sonst bleibt links der sticky Spalte ein Streifen offen.
- `marktwert-entwurf.html` zeigt Umrechnung, Diagramme und Inszenierung mit Live-Daten (analog `awards-entwurf.html`).

**Rekorde** (`buildRecords` in `seasons.mjs`, View `rekorde`). Alles wird gerechnet, nichts gepflegt: ein Rekord entsteht mit dem Ergebnis, das ihn aufstellt. Datiert wird in Liga-Einheiten (Saison, Spieltag, Kampf) — ein Kalenderdatum führt die Liga nicht. Eine Methode im View darf **nicht** `valueOf` heißen: Alpine löst in der Ausdrucksauswertung sonst `Object.prototype.valueOf` auf und zeigt „[object Object]".

**Zugang.** Anmeldung über `auth.mjs` + `Alpine.store('auth')`: genau zwei hart verdrahtete Konten (Janik, Henrik). Beim ersten Login wird ein Passwort gesetzt (PBKDF2-SHA256, 210k Runden, Salt je Konto); in `users/<id>` liegt nur die Prüfsumme. Die Gerätesitzung (`jhdl-auth-v1`) hält Spieler, Prüfsumme und den abgeleiteten Datenschlüssel; ein Passwortwechsel entwertet sie automatisch.
- **Die Anmeldung ist die Quelle für „wer bin ich".** Draft und Transfer lassen nur den Teambesitzer ziehen (`isMyTurn`), `Alpine.store('awards').me` ist ein Getter auf `auth.player`, Presse-Termine und Trainerwechsel prüfen `ownsTeam`.
- **Vertraulichkeit entsteht über den Inhalt, nicht über Regeln.** Die Firestore-Regeln bleiben offen; alles Private wird clientseitig mit AES-GCM unter einem Schlüssel verschlüsselt, der ausschließlich aus dem Passwort stammt (`encryptJson`/`decryptJson`). Ohne Passwort steht in der Datenbank nur Chiffrat.
- Die Regeln müssen für `users`, `private` und `battleLogs` freigeschaltet sein — sonst ist keine Anmeldung möglich.

**Notizen** (`notes.mjs`). Zwei Sorten, bewusst unterschiedlich: **privat** (Freitext zu Teams und Matches, verschlüsselt unter `private/<user>-notes`) und **geteilt** (der Kampfverlauf je Match in `battleLogs`, je Spieler ein Abschnitt, beide lesen beides). Der Kampfverlauf geht als eigener Block in die Presse-Metadaten ein.
- **Geschrieben wird der Kampfverlauf an ZWEI Stellen** — in der Ergebniseingabe (`scheduleView`) und im Teambuilder (`teambuildingView`), beide über denselben `battleLogMixin()`. Das verträgt sich, weil jeder Spieler ausschließlich seinen eigenen Abschnitt schreibt (`entries.<Spieler>`, feldweise gemergt) und der gerätelokale Entwurf unter derselben Schlüssel-Kombination liegt. Eine Sprachaufnahme gibt es nicht mehr.
- **Der Entwurf liegt zusätzlich gerätelokal** (`jhdl-battlelog-draft-v1`, Schlüssel `<matchId>|<player>`) und wird beim Öffnen zurückgeholt. `logSave` verweigert, solange der Store nicht geladen ist oder die Match-ID gewechselt hat — sonst überschriebe der Editor etwas, das er nicht kennt.

**Saison-Abschluss** (`finale.mjs` + `finale.css`). `buildFinaleScript()` macht aus dem Liga-Zustand ein Drehbuch (Intro → Teams von unten nach oben → Pokal → Abspann), `runFinale()` spielt es ab. Start über `seasonFinaleMixin()` aus Spielplan und Tabelle, sobald jede geplante Partie drei fertige Kämpfe hat; beliebig wiederholbar. Deko (Lichtstrahlen, Goldschein) liegt im Bühnenhintergrund, **nicht** in der Szene — sonst bläht sie den Scrollbereich auf.

**Gerätelokaler Zustand** liegt konsequent in localStorage unter `jhdl-*`-Keys (Spalteneinstellungen, Speed-/Weakness-Filter, Matchup-Markierungen, Teambuilder-Notizen und -Movesets, Schadensrechner-Eingaben je Paarung, Draftpläne, Elo-Cache samt letztem Marktwert-Stand und -Update, gewählter Saison-Bereich, Anmeldung). Die Keys sind oben in `main.js` gebündelt. Ausnahme ist der Teambuilder-Sync: `Alpine.store('tbsync')` spiegelt genau die Schlüssel unter `SYNC_PREFIXES` verschlüsselt nach `private/<user>-teambuilder`; `saveJson` meldet jede Änderung über `syncHook`.

**Presse.** Vier Module: `press.mjs` (Kategorien, Redaktionspool, Slot-Planung, Storylines, Sanitizer), `press-context.mjs` (Liga-Zustand → Metadaten-JSON), `press-prompts.mjs` (Systeminstruktion, Kanon-Regeln, Regie, die elf änderbaren Aufträge, Antwortschemata) und `gemini.mjs` (ein `fetch` gegen die Gemini Developer API, kein SDK). Alle vier sind framework-frei und unter Node testbar.
- **Rubriken sind mehrfach.** `article.category` ist die Hauptrubrik, `article.categories[]` hält alle (`categoriesOf`, `normalizeCategories`). „Erste Liga" (`AI_CATEGORY`) setzt `_articleDoc` automatisch auf jeden KI-Beitrag; „Gerüchte" und „Informationen" werden im Editor vergeben. **„Erste Liga" und „Zweite Liga" schließen einander aus** — `normalizeCategories` wirft „Erste Liga" raus, sobald „Zweite Liga" dabei ist. **„Redaktion" ist keine Rubrik, sondern die Herkunft**: Der Stempel hängt am Feld `editorial`; `categoriesOf` blendet den Schlüssel bei eigenen Beiträgen aus, damit er nicht doppelt steht.
- **Drei Zufallsbeiträge je Spieltag** (`RANDOM_ARTICLES_PER_DAY`, ID `s1-rand-d<day>-<n>`) entstehen mit dem 1., 2. und 3. abgeschlossenen Spiel eines Spieltags — nacheinander, nicht parallel, sonst schreiben drei Aufrufe dieselbe Geschichte.
- **Kanon:** Die KI darf Transfers, Sperren, Trainerwechsel und Ergebnisse **nie als Tatsache** behaupten — nur als Gerücht, Forderung oder Spekulation. Fakten stammen ausschließlich aus dem Metadatenblock. Diese Regeln stecken fest in `CANON_RULES` und gelten zusätzlich zum änderbaren Auftrag.
- **Storylines** haben keine eigene Collection: jeder Beitrag trägt die Stränge, die er fortschreibt, bei sich; der Stand ist der jüngste Beitrag, der einen Strang erwähnt (`collectStorylines`).
- **Saisonende und Pause:** Sobald jede geplante Partie ein vollständiges Ergebnis hat (`seasonComplete`), entstehen nacheinander der Saison-Rückblick (`s<N>-review`, Langtext mit `maxOutputTokens: 24576`), je Team ein Saisonzeugnis (`s<N>-off-<teamId>`) und die freien Beiträge der Pause (`s<N>-off-free-<n>`). Die freien Beiträge werden **nicht** auf einmal freigeschaltet, sondern einer je abgeschlossener Ausblicks-Pressekonferenz — so bleibt die Pause in Bewegung.
- **Ausblicksrunde:** nach der Saison tritt jedes Team noch einmal an (`outlookSlotFor`, Slot `outlook`, Typ `pk`), mit **fünf** statt drei Fragen (`OUTLOOK_QUESTIONS`). Die Fragenzahl ist in `startSession` durchgereicht, nicht fest verdrahtet. Der Termin trägt bewusst **keinen** Spieltag (`day: null`) — Vergleiche auf `slot.day` müssen das abfangen.
- **Marktwert-Update:** je Spieltag ein Beitrag (`s1-market-d<day>`, Rubrik „Informationen"), sobald jede Partie des Spieltags vollständig ist UND das Sheet eine Verlaufsspalte für den Spieltag führt. Der zweite Teil ist der eigentliche Auslöser — er erscheint erst, wenn nach dem letzten Spiel tatsächlich aktualisiert wurde.
- **Spielberichte** entstehen automatisch beim Übergang „Match wird vollständig". Der Auslöser ist die beobachtete Änderung, nicht der Bestand (`pressSeenComplete` liegt bewusst außerhalb der Alpine-Reaktivität); der Platz wird per `runTransaction` belegt, damit zwei offene Geräte nicht doppelt schreiben.
- **Termine:** je Team und Spieltag ein Interview und eine Pressekonferenz, die Verteilung auf „vor/nach dem Spiel" wird deterministisch aus `teamId + day` gelost (kein Schreibzugriff, auf jedem Gerät gleich). Davor liegt einmalig die Auftaktrunde (`BONUS_ROUND_DAY`); Pressebetrieb beginnt mit `PRESS_FROM_DAY`. **„Nach dem Spiel" hängt an der Pressefreigabe** (`isPressReleased`), nicht am dritten Kampf — erst reden, wenn die Redaktion das Spiel gesehen hat. `slot.needsRelease` unterscheidet „Match noch offen" von „wartet nur auf die Freigabe".
- **Bausteine im Textkörper** (`press-tiles.mjs`): `[marktwert: …]`, `[verlauf: …]`, `[statistik: …]`, `[team: …]`, `[trainer: …]`, `[ergebnis: …]`, `[tabelle: …]`, `[video: …]`, `[bild: <URL>]` als eigener Absatz. Aufgelöst wird **beim Anzeigen** (`presseView.articleBody` -> `renderTiles`), nicht beim Speichern: so bleibt der Beitrag reiner Text ohne zusätzliche Whitelist, eine Marktwertkachel zeigt den heutigen Stand, und im Editor bleibt der Baustein als Zeile sichtbar.
- **Entschieden ist erst, was rechnerisch entschieden ist.** `standingsBlock` liefert je Team `offeneMatches`, `maximalPunkte` (3 je Match) und — konservativ gerechnet — `besterMoeglicherPlatz`, `schlechtesterMoeglicherPlatz`, `titelSicher`, `klassenerhaltSicher`, `abstiegSicher`. Das Modell rechnet nicht mehr selbst: `CANON_RULES` Nr. 9 macht diese Felder bindend. Ein Klassenerhalt gilt erst bei `klassenerhaltSicher: true`.
- **Die Grundhaltung bleibt kritisch, aber nicht ausschließlich.** Der Ton `anerkennend` macht regelmäßig eine echte Leistung zum Hauptthema, ohne relativierendes Aber im Schluss (`CANON_RULES` Nr. 10).
- **Dauerhafte Referenzen statt „die letzten acht".** `referenceBlock` schickt Beiträge, die dauerhaft gelten, in JEDEN Kontext — von Hand markiert (`reference: true`), jede Redaktion der Spieler und den Saison-Rückblick (`isReference`), mit deutlich mehr Text. Ein Erklärstück fällt damit nicht mehr nach ein paar Spieltagen aus dem Kontext.
- **Auftragsbeiträge** (`commissionArticle`, Quelle `commission`): Freitext aus dem Newsroom bestimmt das Thema, nie die Fakten. Der Auftragstext bleibt an der Quelle stehen, damit ein späterer Anlauf dieselbe Vorgabe hat.
- **Neuzugänge im Pool** (`s<N>-newcomers`, Quelle `newcomers`): einmalig je Saison, sobald `pokemon.json` ein `since: N` führt. Autor ist fest Scott; der Auftrag verbietet ausdrücklich Elo- und Marktwerte, weil es für Neuzugänge noch keine gibt. Der Auslöser ist der BESTAND, nicht eine Änderung — `pressTriedNewcomers` verhindert deshalb, dass ein Fehlschlag den Effekt im Kreis dreht.
- **Der API-Key liegt gerätelokal** (`jhdl-press-key-v1`) und darf nie nach Firestore. Ohne Key bleibt die Ansicht bedienbar, es entstehen nur keine neuen Beiträge.
- **Zwei Schlüsselformate:** `AIza…` geht in den Header `x-goog-api-key`, `AQ.…` (seit 2026 das einzige, das AI Studio ausgibt) in `Authorization: Bearer`. `gemini.mjs` wählt nach Präfix und probiert bei 401 automatisch das andere Verfahren.
- **Denksteuerung ist modellabhängig:** die 3er-Generation nimmt `thinkingLevel`, die 2.5er ein `thinkingBudget` — beides zusammen ist ein Fehler. Denk-Tokens zählen gegen `maxOutputTokens`; ohne Deckel kommt die Antwort leer mit `MAX_TOKENS` zurück. Gemini 3 läuft ausdrücklich auf Temperatur 1.0.
- `<select>` mit `<template x-for>`-Optionen: x-model setzt den Startwert, bevor die Optionen im DOM stehen. Die Vorauswahl deshalb über `:selected` am `<option>` lösen, nicht nachträglich per JS.

**Awards.** Nominieren, dann entweder zwischenspeichern (`saveNominations`) oder „Ich bin fertig" (`confirmNominations`). Sind beide fertig, springt der Status von selbst auf `voting` — einen Knopf, der die Abstimmung für beide startet, gibt es bewusst nicht mehr. **Die Ruhmeshalle wartet auf die Awards:** `awards.openVotes()` zählt die offenen Abstimmungen, `seasonFinaleMixin().finaleReady()` gibt den Saison-Abschluss erst frei, wenn keine mehr offen ist.

**Siegerehrung** (`ceremony.mjs` + `awards.css`). Fünf Inszenierungen (`CEREMONY_VARIANTS`) teilen sich denselben Ablauf und werden je Ehrung zufällig gewählt (`pickCeremonyVariant`); sie unterscheiden sich nur in Tempo (`timing`), Enthüllungsgeste (CSS unter `.cer-stage[data-variant="…"]`) und Schlusseffekt (`burst`). `awards-entwurf.html` kann eine Variante zum Ansehen erzwingen.

**Draft ab Saison 2** (`draft.mjs`, framework-frei). Zwei Dinge kommen zum Snake-Draft dazu:
- **Die Reihenfolge wird nicht mehr ausgelost.** `buildDraftOrder` leitet sie aus der Endtabelle der Vorsaison ab: Platz 1 zieht zuerst, die Plätze 7 und 8 steigen ab. Ein Aufsteiger gehört immer dem Spieler, dessen Team abgestiegen ist; gehören BEIDE Aufsteiger demselben Spieler, lässt sich Position 7 nicht rechnen — der Draft bleibt dann im Status `order` stehen, bis dieser Spieler gewählt hat (`orderChoice`, `chooseFirstPromoted`).
- **Vertragsverlängerungen** (im Code `renewal`, im Frontend und in der Presse AUSSCHLIESSLICH „Vertragsverlängerung"). Je Tier eine, höchstens fünf. Das Fenster öffnet zu Beginn jeder Runde (`renewalRound`, `renewalDone`); wer einlöst, zieht sofort und hat seinen Zug dieser Runde verbraucht — deshalb rechnen `currentPick` und `draftPicks` die Runde als „erst die Verlängerungen in Snake-Reihenfolge, dann der Rest". Verfall wird NICHT gespeichert, sondern gerechnet (`renewalState`): kein verfügbares Pokémon im Tier oder die zwei Plätze schon gefüllt.
- **Es gilt das Tier der NEUEN Saison** (`RENEWAL_TIER_SOURCE = 'current'`): Wechselt ein Pokémon zwischen den Saisons die Klasse, zählt die heutige. So hält die Verlängerung die Regel „höchstens zwei je Tier" ein — dafür kann ein Team in einem Tier drei Kandidaten haben und in einem anderen keinen.

**Draftplan** (`draftplan.mjs` + `draftplan-view.mjs` + `draftplan.css`, zweiter Tab im Draft-View). Die private Vorbereitung eines Drafts: zehn Slots (zwei je Tier), je Slot beliebig viele Kandidaten, darüber Pfade.
- **Ein Pfad ist eine Wahl je Slot, Pfade bilden einen BAUM.** Ein Kind speichert NUR die Slots, in denen es vom Elternpfad abweicht (`own`), alles davor bleibt lebendig verknüpft (`effectivePicks` läuft die Kette hoch). Das ist der ganze Trick gegen die kombinatorische Flut: „unterscheiden sich erst ab Slot 7" ist eine Zeile Daten, und eine Korrektur oben wandert von selbst nach unten. `own[slot] = null` heißt „bewusst leer" und ist von „nicht gesetzt" zu unterscheiden.
- **Die Zugreihenfolge ist eine eigene Größe** (`plan.order`, je Pfad überschreibbar über `path.order`) — gedraftet wird nicht in Tier-Reihenfolge.
- **Erreichbarkeit wird gerechnet, nie gespeichert** (`liveState` + `pathViability`): Ein Pfad stirbt, wenn ein Wunsch an ein anderes Team ging ODER wenn eigene Picks in einem Tier mehr Plätze belegen, als der Pfad dort noch frei hat. Verworfene Pfade verlassen die Hauptliste und stehen in einem eigenen Abschnitt mit Sprung zurück zum betroffenen Slot.
- **Das Pfad-Board rechnet in festen Pixeln** (`BOARD` in `draftplan-view.mjs`, dieselben Werte als CSS-Variablen am Board) statt zu messen — Kandidatenposition folgt aus Spalten- und Zeilenindex. Gezeichnet werden die Linien NUR in den Zwischenräumen; über einer Kachel wären sie verdeckt. Ein `<template x-for>` in einem `<svg>` landet im falschen Namensraum — die Linien kommen deshalb als Zeichenkette über `x-html`.
- **Die Komponente liegt bewusst nicht in der `main.js`**, damit `draftplan-entwurf.html` sie mit erfundener Liga fahren kann; registriert wird sie trotzdem dort. Der Entwurf holt sein Markup aus dem echten Partial.
- Gespeichert wird unter `jhdl-draftplan-v1` und läuft über `SYNC_PREFIXES` in die verschlüsselte private Ablage mit.

**Teamfarbe** (`teams/<id>.color`). Vom Besitzer im Hero gewählt, sonst stabil aus der Team-ID abgeleitet (`teamColor`). Sie trägt den Hero und färbt die Team-Linie in jedem Diagramm — Tabellenverlauf und Marktwertvergleich. Nur waschechte 6-stellige Hex-Werte werden übernommen (`normalizeHexColor`), weil der Wert direkt in einen `:style`-Ausdruck geht.

**Robustheit bei KI-Aufrufen.** `generateJson` unterscheidet Zustände von Fehlern: Überlastung (429), Serverfehler, Netzwerkabbruch, abgeschnittene (`MAX_TOKENS`) und unlesbare Antworten sind `retryable` und werden bis zu `GEMINI_ATTEMPTS` Mal mit wachsender Pause wiederholt; eine abgeschnittene Antwort bekommt beim nächsten Anlauf mehr Platz und weniger Denkzeit. Alles andere (Schlüssel, Modell, Inhaltsfilter) fliegt sofort hoch. Ein gescheiterter Beitrag merkt sich in `errorModel`, WOMIT er gescheitert ist; `retryArticle`/`retrySession` schreiben ihn neu — mit wählbarem Modell und unabhängig von der Quelle. Ein Termin mit vorliegenden Antworten wird nur neu geschrieben, nie neu gestellt.

**Trainer** (`teams/<id>.trainers`) sind eine eigene Position: kein Kampf, kein Draft, keine Statistik, nur im Team-View. Amtszeiten werden in Spieltagen geführt — `fromDay: null` heißt „vor der Saison", `untilDay: null` heißt „amtierend". Logik in `trainers.mjs`, Schreibzugriffe über `appointTrainer` / `updateTrainer` / `dismissTrainer` im league-Store.

## Konventionen & Fallen

- `docs/` ist Build-Output und wird bei jedem Build geleert — dort niemals editieren.
- `vite.config.js` setzt `base: './'` für GitHub Pages; keine absoluten Asset-Pfade einführen.
- Änderungen werden dem Projektinhaber als Zip nur der geänderten Quelldateien übergeben (ohne `docs/`); bei neuen npm-Abhängigkeiten `package.json` und `package-lock.json` mitgeben. Git-Operationen sind hier absolut tabu.
- `CHANGELOG.md` dokumentiert Features feature-weise (Englisch) und ist die beste Quelle für die Historie einer Ansicht.
- UI setzt native Plattform-Features ein (Popover-API, `@starting-style`, View Transitions, Container Queries) statt JS-Bibliotheken — bei neuen Overlays diesem Muster folgen.
- Jede Umsetzung muss tadellos mobilfreundlich umgesetzt sein
- Mixins werden per Spread eingesetzt (`{ ...mixin() }`). **Spread wertet Getter aus** und kopiert nur deren Ergebnis — in einem Mixin gehört alles Veränderliche deshalb in eine Methode, nicht in einen Getter (siehe `damageCalcMixin`).
