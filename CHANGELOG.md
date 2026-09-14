# Changelog

## Accounts & login (new)
- **One place to sign in.** The old shared access password is gone. Instead there are exactly two hard-wired accounts, Janik and Henrik. The first time an account is picked, its password is set (with confirmation and a clear warning that it cannot be reset), and from then on that account can sign in from any device.
- **Passwords never leave the device in the clear.** They are stretched with PBKDF2-SHA256 (210 000 rounds, a fresh salt per account) and only the digest is stored in the `users` collection. The signed-in state is kept per device, so nobody has to log in on every visit; changing the password invalidates every stored session automatically.
- **The login now drives everything that used to be "who am I?"**: in the draft and the winter transfer only the owner of the team on the clock can pick (everybody else sees whose move it is), awards no longer ask who is sitting at the device, interviews and press conferences can only be taken by the team's own player, and trainers can only be appointed, edited or dismissed by their own team.
- **Private data is encrypted, not merely hidden.** The Firestore rules are open by design, so anything private is encrypted client-side with AES-GCM under a key derived from the password alone. Without the password the database holds nothing but ciphertext.
- **Teambuilder backup.** Movesets, notes, speed-tier settings, matchup colourings and damage-calculator inputs can be pushed to the database and pulled back on another device — automatically after every change if you want. Encrypted, so the other player cannot read them.

## Notes (new)
- **Private notes on teams and matches.** Free text, saved encrypted under your own account, available on every device and invisible to the other player. Teams have their own notes module; matches can be annotated straight from the result entry and from the Teambuilder.
- **Shared battle log.** Optional, and deliberately *not* private: each player keeps their own section on a match, both can read both. It is the memory for the second leg — and the detail source the press draws on for match reports, news, interviews and press conferences.
- **Dictate the battle log.** Record while you play: several minutes at a stretch or many short push-to-talk snippets. Everything is sent to the AI in a **single** request, which orders it, strips the stumbles and writes it out — with the proper names spelled correctly, because both squads and their trainers are handed over as a vocabulary.
- **Teambuilder gets a second panel.** Damage calculator and battle log sit side by side as two collapsed bars and each take the full width when opened. The panel picks the current fixture of the two teams, takes the battle log by hand or by voice, holds the matchup note — and folds out the first leg (note plus both players' logs) while you build for the return match.

## Season finale (new)
- **A hall of fame for the whole season**, startable from the schedule and from the standings as soon as the last result of the season is in, and repeatable as often as you like.
- Runs for a few minutes and works through the table **from bottom to top**: every team with its record, its path through the season as a drawn curve, every fixture with its result, the trainer with term and personality, the awards it collected and its most effective Pokémon.
- **The top three get their complete squad**, paraded in one by one with kills and deaths. The champion gets the longest scene, then a trophy scene of its own with gold rain, and the closing scene settles the Janik-versus-Henrik duel and names the league's standout Pokémon.
- Play, pause, step forward and back; scenes taller than the screen scroll themselves like a set of credits. Reduced motion is respected throughout.

## Awards
- **Five stagings of the ceremony instead of one**, picked at random each time. The dramaturgy is identical — last place first, up to the podium — but the pace and the gestures differ: *Bühnenlicht* (the original), *Schlagzahl* (hard cuts, impact zoom, shockwaves), *Anzeigetafel* (plates flip in mechanically, light beams), *Anflug* (everything arrives out of the depth, sparks) and *Gala* (slow, soft, gold embers). The design page can force a single variant for previewing.

## Press
- **Articles can sit in several categories.** Four new ones alongside the existing rubrics: **Erste Liga** (set automatically on everything the AI writes), **Zweite Liga**, **Gerüchte** and **Informationen**. The filter, the badges and the editor all work with multiple categories; the first one is the lead rubric.
- **Three free articles per matchday** without a preceding interview or press conference, released with the first, second and third completed fixture of that matchday. The model picks its own angle and rubric and is told what the other pieces of the matchday already covered. The briefing is editable like the other five.
- **Margit joins the newsroom** — radio host at *Radio Ligawelle*, writes the way she presents: spoken language, built around soundbites, warm until it gets uncomfortable.
- **Teams with a pending appointment are marked** in the team picker of the appointments tab; your own teams pulse, the other player's stay quiet.
- **Several storylines per team at once** are now explicitly part of the canon: trainer question, slump and squad row are three threads, not one, and a running thread keeps its id instead of being reopened under a new name.
- **The flash effect is gone from the lead article** in the newsroom; it stays where it belongs, on the press conference stage.
- **Mobile editing fixed.** Editing an article no longer loses its text: the editor is filled the moment it exists rather than afterwards, and every keystroke is mirrored into the draft. A single Enter now starts a real paragraph — mobile browsers that insert a `<div>` are rewritten to a paragraph instead of having it dissolved by the sanitizer.
- **Images in the editor can be scaled** — tap an image and set it to 25, 50, 75 or 100 per cent, or remove it.

## Draft
- **Export the complete draft order** from the export menu of the draft board: every pick in snake order with round, team, player and Pokémon, plus the drawn starting order, as JSON, XML, CSV or Excel.

## Press (new)
- **A press view of its own**, in the sidebar above Awards, with two tabs: the **newsroom** (a filterable feed) and **Interview & PK**.
- **Four categories** — Spielbericht, News, Klatsch und Tratsch, Redaktion — plus a team filter and a full-text search over the archive. Six fixed reporters (Alba, Pia & Udo, Sina, Dexio, LeBelle, Matière) each write in their own documented voice; the portraits ship pre-cropped to head and torso.
- **Match reports write themselves.** The moment the third battle of a match is entered, a report is generated from the result — three battles, line-ups, kill log, table, form, tier, Elo, per-Pokémon usage, awards, fixtures, trainers with their personality, and the last eight articles about the teams involved. The claim on a report goes through a Firestore transaction, so two open devices cannot both write it.
- **Storylines run across matchdays.** Every article carries the threads it opens or advances, with a status (neu · laufend · eskaliert · beruhigt · beendet); the state of a thread is whatever the most recent article said about it. A ticker above the feed shows what is currently in circulation.
- **Interviews and press conferences.** Per team and matchday there is one of each: one before the match (free once the previous fixture in the schedule has a result), one after (free once the third battle is in). Which format takes which slot is drawn per team and matchday — deterministically, so both devices see the same thing. In the interview a single reporter asks three pointed questions of a trainer *or* a Pokémon from the squad; at the press conference three reporters ask one question each of the trainer, every question with a 35 % chance of being a provocative one. Three prepared answers per question, or write your own.
- **Answers have consequences.** A composed, concrete answer lets a story run out of steam; an evasive one keeps it simmering; hitting back escalates it and pulls others in. The resulting article quotes what was said — and frames it as generously or as unkindly as the answer deserves.
- **The players can publish themselves.** A rich-text editor (headings, quotes, lists, links, images) with category, teams and by-line of choice. Editorial pieces are marked as such and are fed back into the generation as settled fact, which makes them the lever for steering a storyline by hand.
- **A one-off opening round before matchday 8**: every team goes to one press conference and one interview, 16 appointments in total. Matchday 8's own press slots stay locked until that round is through, then everything continues on the normal rhythm. Regular coverage begins with matchday 8; the matchdays before it are not worked up retroactively.
- **Nothing happens that the players did not decide.** Transfers, bans, suspensions, dismissals and signings may only appear as rumour, demand or speculation — never as fact. Facts (results, table, kills, usage, tier, Elo) come exclusively from the metadata. Tone is drawn per article from a weighted set (analytical, classic, dramatic, thoughtful, tabloid, sardonic, absurd) and recently used story archetypes are dropped from the suggestions, so the feed does not settle into two or three patterns.
- Runs on the **Gemini developer API**. The API key is device-local (localStorage) and is never written to the database; both the key and the five editable briefing prompts sit behind the gear icon in the top right, together with a maintenance tab for reports that did not get written.
- **Gemini 3 models**, with Gemini 3.8 Flash as the new default and 3.5 Flash, 3.5 Flash-Lite, 3 Flash Preview and 3.1 Pro Preview alongside the 2.5 generation. Thinking is steered per generation — `thinkingLevel` for the 3 series, a token budget for 2.5 — and Gemini 3 runs at the temperature it wants (1.0) rather than the old creative bump.
- **Both API key formats.** AI Studio now hands out `AQ.` keys instead of `AIza`; those two need different HTTP authentication, so the key format decides the scheme and a rejected key is retried with the other one before the error reaches the view.
- **Connection test fixed.** The 2.5 models think before answering and those thinking tokens count against `maxOutputTokens`, so the test's 256-token ceiling was spent before a single character of the answer — a valid key still came back as a failure. The thinking budget is now capped explicitly on every call, and the test result names the reason in plain words, Google's own wording included, instead of a generic "failed". The key travels in the `x-goog-api-key` header rather than the query string.

## Damage calculator (new)
- **Damage calculator in the Teambuilder**, between the matchup and the speed-tier modules. Collapsed to a single bar until you open it; the calculation package (`@smogon/calc`) and the German name table are only fetched on first use, so the Teambuilder starts as fast as before.
- **Only the Pokémon of the current matchup** can be picked, for attacker and defender, with a one-click **swap**.
- **Everything in German**: natures carry their stat effect in the label ("Frech (Ang+, SpA−)"), abilities, items and moves are chosen from German name lists (English names still work as input). The table is generated once from the public PokéAPI localisation data — `node scripts/build-i18n-de.mjs` — and shipped as a static file; entries without a German name (the new Champions Mega stones, for instance) fall back to English.
- **Champions stat points instead of EVs**: a 0–32 slider per stat (KP, Ang, Vert, SpA, SpVert, Init). One stat point equals eight EVs, which reproduces the Champions values exactly across the whole range — the unit test checks all 19 800 combinations against `speedAt()`.
- **Stat stages** from −6 to +6 per stat, and the computed stat line next to each side.
- Format is fixed to the one Champions VGC uses: **generation 9, doubles**. Per move the calculator shows the percentage corridor, a bar, the move's type and base power, and how many hits it takes.
- **Both directions into the matchup moveset**: load a stored set into the calculator, or write the calculator's ability, item, moves and stat points back into it.
- All 307 Pokémon of the draft pool resolve against the calculator's species data, invented Champions Megas included; `node scripts/check-calc-species.mjs` guards that.

## Trainers (new)
- **Teams have trainers.** The team view shows the trainer in office with portrait (square, 256 × 256 works best), gender and personality adjectives as small tags.
- **Appoint, edit, dismiss.** Dismissing ends the term with the latest played matchday and keeps the entry; the successor starts on the following matchday, pre-filled and adjustable.
- **Trainer history** with the term of each trainer in league terms ("Before the season – matchday 5", "From matchday 6 – today").
- Trainers are their own position: they do not battle, are not drafted, appear in no statistic, and exist only in the team view — the groundwork for the planned press view.
- Stored as an array on the team document, so a change is one write and needs no new collection or rule. The initial data set including retroactive changes lives in `scripts/data/trainers.csv` and is written with `node scripts/seed-trainers.mjs`.

## Navigation
- **Back bar above every view** that names where it goes ("Zurück zu Tabelle"), and the **browser back button now works**. Every view change writes a history entry; the URL stays untouched, so there is still no routing to maintain and no server rewrite needed.
- **Sidebar reordered by relevance**: Tabelle · Spielplan · Teambuilding · Teams · Statistiken · Presse · Awards · Spieler · Draft · Transfer. A running draft or transfer window moves to position 1 for as long as it lasts.

## Standings
- **Step through past matchdays** with arrows above the table; each Pokémon's standing is recomputed from the results up to that day, and a second button jumps back to the current one.
- Each row shows its **movement against the previous matchday** (▲/▼ with the number of places).

## Matchday
- The match card now also shows the **result by kills** under the result by battles.

## Pokémon detail
- New **Awards** section above the timeline: every ballot this Pokémon was nominated for, wins first, with the award seal, the term, who nominated it, the average and the place. Results stay hidden until you have watched the matching ceremony — the same spoiler rule the pins follow.

## Awards
- **Pokémon boxes in the ceremony are clickable** and open the Pokémon's detail page. Duo awards link each sprite separately; team and match awards stay unlinked.

## Draft
- **Full draft history** in the draft view, grouped by round, all picks in snake order — and per team at the bottom of the team view. Pokémon given away in the winter transfer are marked; their exact draft position was never recorded, so they are listed at the end of their team's order.

## Statistics tables
- New column **"Kämpfe % (Kader)"**: the share of *all* the team's battles this Pokémon was used in — matches where it was not nominated count in the denominator. The existing "Kämpfe %" is now labelled "(Aufgebot)" and still only measures the matches it was nominated for.

## Elo
- The obsolete "Skarabron" alias is gone — the sheet now spells Skaraborn correctly. Sheet names that match no Pokémon are **named in the Elo view** instead of silently ending up without an Elo value.

## Teambuilder
- **Weakness comparison is sortable per team** — the "attack type" header sorts by the shared total (default, strongest first), each team header sorts by that team's count alone; clicking the active column flips the direction.
- **"X trifft Y" is now "Effektivität von STAB-Attacken"** and moved to the bottom of the view. The old wording suggested the matrix covered every attack a Pokémon could carry; it only ever looked at the Pokémon's own types, and the new heading and description say so.
- **Tile markings only cycle in the "Nur Pokémon" view.** In the notes and moveset views a tap on the tile used to change the colour while you were editing; there it does nothing now. Long-press still clears the marking in every view.
- **PokéZone link per Pokémon** in the roster selection — a small icon next to the name opens that Pokémon's page on pokemon-zone.com in a new tab. The slug is derived from the English name in `pokemon.json` (`pokezoneUrl` in `scoring.mjs`, with a lookup table for forms the site names differently).

## Awards (new)
- New **Awards** view with its own sidebar entry. Three matchday awards (Pokémon of the matchday, biggest disappointment, biggest surprise) and 23 season awards including per-tier winners, best duo, best match, best draft, best transfer window and a **Most Valuable Pokémon vote per team** (8 separate ballots).
- **Nominate → vote → ceremony.** Each player proposes 0–3 candidates, then either starts the vote right away or confirms and waits for the other; once both have confirmed, voting opens automatically. Every option is rated 0–10 by both players and the mean decides. With both ballots in, the ceremony unlocks.
- **Ceremony** as one authored sequence: a stage light that breathes between reveals, the lowest place first and upwards to 3rd — each row wiped in from the left, its mean counting up, a single light sweep crossing it — then the light drops and **1st and 2nd appear together**, the winner's seal materialising out of blur while confetti fires. Places 3 and below stay as a quiet recap under the podium. Skippable, and `prefers-reduced-motion` runs the same steps without travel, blur or confetti.
- **A tie for first place means everyone wins**: the winners share the podium at equal size, each with its own seal and its own pin, and the archive card labels it "Gleichstand · n Sieger". Three-way ties are revealed together too.
- **Duo awards show both sprites** — in the reveal row, on the podium, in the vote dialog, on the nomination chips and in the archive card.
- **Drawn seals** instead of icons: every award is distinguishable by enamel colour, base shape (disc · rosette · shield · hexagon · bar) and engraving, so it stays readable as an 18-pixel pin. The same geometry serves catalogue, ceremony and pin.
- **Pins wherever an entry appears** — bottom right over a Pokémon sprite, on team crests in the standings, team cards and schedule, and on the match card for "best match". Repeated matchday awards stack with a slight overlap and alternating tilt; from the fourth pin a plaque counts on. Hovering a pin names **which award from when**; tapping opens the same text in the shared info popover. The Teambuilder stays pin-free.
- **Spoiler protection**: winners — pins included — only become visible once *you* have watched the ceremony. The closing line tells you whether the other player has seen it yet.
- Matchday awards cover **every played matchday**, including the ones played before the feature shipped — they are awarded retroactively. The first awarded matchday is one constant, `MATCHDAY_AWARDS_FROM` in `awards.mjs`; raising it hides the matchdays below, and the view says so.
- Season awards unlock only once **every match of every matchday has a result**; until then the "up next" tab states how many are missing.
- One Firestore doc per ballot in the new `awards` collection (`s1-<award>[-d<day>|-<teamId>]`). The collection **needs its own security rule**; without it the view says so instead of failing silently. Who you vote as is a device-local choice (no login) shown at the top of the view.
- Logic lives framework-free in `awards.mjs` (catalogue, merge, tally, reveal order, spoiler note), visuals in `award-visuals.mjs`, the sequence in `ceremony.mjs` — all unit-tested.

## Pokémon detail
- **Record per partner and opponent** on battle level: whom this Pokémon won and lost with most often, and against whom. Switchable between **absolute and percent**, with a minimum number of shared battles to keep one-off pairings out.
- Initiative grid now also lists the **negative nature** row and the **×0,5** column.

## Statistics tables
- New **Elo column** for both Pokémon rankings (league + team detail), fed from the Elo sheet; "—" when a Pokémon is not in the sheet.
- **Second sort metric** selectable in the column popover, with its own direction — it breaks ties in the primary column. Sorting by a hidden metric is allowed.

## Player duel
- Top Pokémon switchable between **by kills** and **by battle win rate**. The win-rate view takes a minimum usage threshold, either an absolute number of battles or a share of the team's battles, so a single lucky win cannot top the list.

## Speed tiers
- **Negative nature** selectable per Pokémon (Init−), next to neutral, Init+ and the two combined modes; the new "all three" mode shows Init−, neutral and Init+ at once.
- **×0,5 and ×0,67** as additional in-battle modifiers, hidden behind the config dialog so the table stays calm by default.
- **Mega Pokémon**: the pre-Mega form can be switched into the initiative tier list per matchup — the dialog shows it with its own calculated values and the row is labelled "vor Mega". The base form is resolved via the dex number.

## Teambuilder
- Mega Pokémon get **"Mega-Stein" pre-filled** in the moveset item field (only while nothing is stored for them in that matchup).
- **Long-press a matchup tile clears the marking** immediately instead of cycling through every colour. The following click is suppressed, text selection and the context menu are off.

## Navigation & input
- **Sidebar collapsible** to an icon rail; the state is remembered per device.
- **Tapping neutral space now leaves an input field.** iPadOS kept the focus and the on-screen keyboard open; a tap outside any form element, button or label now blurs actively.

---

## Speed tiers: per-Pokémon SP and nature
- **Initiative SP are editable per Pokémon** (0–32) in the team detail and in the Teambuilder, replacing the fixed 0/32 assumption for that Pokémon. Default stays **0 and 32**.
- **Nature choice per Pokémon** — neutral, Init+ or both (default: both), so the table can show exactly the spread you actually build. Speed boosts (×1,5 / ×2) still multiply every case.
- Both settings live behind one **slider-icon button** per Pokémon that opens a compact dialog (range slider, quick chips 0/8/16/24/32, nature icons, live preview of the resulting rows). Touch-friendly; the control row wraps to a second line on narrow screens. Stored in localStorage — globally per Pokémon in the team detail, per matchup in the Teambuilder.
- New `speedCases(base, {sp, nat})` in `scoring.mjs` (plus `clampSp`) generates the display cases; covered by unit tests.

## Teambuilder
- **"Only green" filter** for both team views — one toggle above the roster tiles (applies to all four tile modes: only Pokémon / + notes / + moveset / everything) and a separate one for the **initiative tier list**. Both persist in localStorage.

## Winter transfer
- **Skips now appear in the history** — a skipped turn is logged with team, round and phase ("release skipped" / "pick skipped") instead of vanishing. History entries carry the turn index, so the log is ordered exactly as played.

## Fixes
- **Broken sprites in the battle detail after transfers** — Pokémon that left a team were resolved against the current roster only. Images now fall back to the master data (`pokemon.json`), so past squad members keep their sprite in old results.
- **Start view follows the league state** — running transfer → Transfer, running draft → Draft, otherwise the schedule (as soon as it is drawn). Previously the draft was always the entry point.

## Statistics view (new)
- New **Statistics** view with its own sidebar entry; the filterable Pokémon ranking moved here out of the standings page. Sidebar navigation is now scrollable for small desktop screens. A **Stats | Elo** toggle switches between the two tabs.
- **Ranking cards redesigned** — large Pokémon sprite in focus with the team crest as a faded backdrop behind it, then place / name / team / stats below.
- Ranking and Elo tables now always span **at least full width** even with few columns; on mobile only **rank + sprite** stay sticky (name + team scroll away).

## Elo / tier forecast (new)
- New **Elo** tab reads a public Google Sheet client-side via the gviz endpoint (**no API key**, no proxy), cached in localStorage with a **refresh button** ("updated … ago"). Sortable table with sprite, current team, current tier and the **projected next-season tier**; tier differences are highlighted (▲/▼ plus a colored row).
- **Tier-change highlights** above the table group promotions and demotions as cards.
- Elo value, rank and the tier forecast also appear on the **Pokémon detail page**.
- The service-account key is intentionally **not shipped**; the sheet must stay link-viewable.

## Teambuilder
- **Last matchup remembered** (localStorage) and restored on load, plus a **dropdown of the last 6 matchups** for quick switching.
- **Notes & moveset per Pokémon, per matchup** — free-text note plus item, ability, four moves and EV spread. New view switch: **only Pokémon / + notes / + moveset / everything**.

## Tables
- **Standings lines reworked** — red line under 1st place, thick red relegation line above the last two rows, normal dividers everywhere else (including between the last two).
- Removed **deaths/battle** (redundant: survival % = 1 − deaths/battle). New metric **Kämpfe %** — battle share within a matchup (battles / (matchups × 3)).

---

## Views & stats
- **Table ⇄ card toggle** for both Pokémon ranking tables (league + team detail). View mode persists in localStorage alongside the column settings; sorting and filters apply to both modes.
- **Relegation line** — a thicker divider above the last two standings rows marks the relegation zone.
- New metric **Kpf/MU** (battles per matchup, 0–3): how often a nominated Pokémon is actually fielded across the up-to-three battles of a match. Added to the stat catalog, so it appears in both ranking tables and the detail view.

## Teambuilder
- **Matchup view** moved into Teambuilding — both full 10-rosters side by side, screenshot-friendly.
- **Click marking** — click a Pokémon to cycle a colored frame none → green → yellow → orange → red → none. Private, stored in localStorage **per team pairing** (order-independent).
- **Showdown export** — generates a valid Pokémon Showdown teambuilder import (species only, no moves/nature/EVs). Modes: all / only green / green + manual top-up to 6; team selectable. Mega and regional forms are mapped to Showdown species (e.g. `Mega Charizard Y` → `Charizard-Mega-Y`, `Alolan Raichu` → `Raichu-Alola`).
- **Schedule → Teambuilding link** on matches without a result, pre-filling both teams.

## Winter transfer
- New **winter transfer** phase (unlocks after the draft, mid-season): 4-round snake, order by table position (last place first). Rounds 1–2 release one Pokémon or skip; rounds 3–4 pick a free Pokémon of a released tier (pool = every Pokémon of that tier not currently on a roster) or skip. Rosters change mid-season — Pokémon move between teams or leave entirely.
- **Stat attribution is now result-driven**: a battle counts for the team that fielded the Pokémon at that time, not its current owner. Team detail shows a Pokémon's stats only for the time it was on that team; the league ranking keeps released Pokémon (labelled "Frei"); Pokémon profiles span every team played for.
- Transfer state is stored under `drafts/transfer-s1` (reuses the existing open `drafts` access). Dev reset: `node scripts/reset-transfer.mjs`.

## Tests
- `scripts/test-scoring.mjs` — node:assert unit tests for result-driven attribution, released-Pokémon handling, Kpf/MU, and the Showdown mapping. Run: `node scripts/test-scoring.mjs` (no dependency needed).

---

## Battle scoring
- **Decoupled winner, result, and kill log** — a battle's winner (win/draw/loss) is now set independently from the score. Survivors are entered freely (0–4 per side). Kills/deaths are counted **only** from the kill log, so a "survived" Pokémon never takes an undeserved death (e.g. wins by rule violation). Points follow the explicit winner; kill differential now comes from the kill log (team and Pokémon stats finally match). Old results stay compatible.

## Stats & tables
- Added **battle win rate** to the Pokémon detail view.
- Pokémon ranking tables (team detail + standings) are now **configurable tables** — toggle columns via checkboxes, reorder by drag & drop, sort by any column; saved in localStorage. New stats: K/D, kills/battle, deaths/battle, battle win %, match win %, survival %, speed, cost.
- Added **filters** (type/tier/team) to the league-wide ranking.
- Added **ⓘ info popovers** next to every stat label.

## New views
- **Players** — head-to-head Janik vs Henrik: match/battle record, kills, diff, points, avg. placement, top Pokémon.
- **Teambuilding** — compare two teams, toggle Pokémon on/off, shared speed tier list (colored by team, ×1.5/×2), two-way threat matrix, weakness comparison.

## UX
- **Global search (Ctrl/⌘ K)** — find teams, Pokémon and matches; opens the relevant view.
- **Matchup tab** in result entry (mobile, before a result exists) showing all 20 Pokémon for a screenshot.
- Team names are now shown in the player's color everywhere.
- Match detail header made responsive via container queries; team names wrap instead of being cut off.
- Fixed: switching views no longer inherits the matchday's deep-scroll position.

## Export
- Export **schedule, battle details, standings, ranking, teams, and draft pool** as JSON, XML, CSV, or Excel (.xlsx).

---
*New dependency: `xlsx` — run `npm install` before building.*
