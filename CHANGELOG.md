# Changelog

## Draft from season 2 on (new)
- **The order is no longer drawn, it is earned.** From season 2 the draft order comes out of the previous season's final table: first place picks first, sixth picks sixth. Places 7 and 8 are relegated and replaced by promoted teams, and a promoted team always belongs to the player whose team went down. If each player has one newcomer, the relegation places decide which of them picks seventh. If both newcomers belong to the same player, the draft waits at the very start until that player has chosen which of his two teams opens — before a single pick and before any contract extension.
- **Contract extensions.** Every team that survived the previous season may bring back up to five of its old Pokémon, one per tier. At the start of every draft round each of them is offered the chance to redeem one: whoever extends picks that Pokémon immediately and has spent his turn for that round, whoever passes keeps the extension for later. Only the very first one is safe — after that any other team can take an eligible Pokémon in the regular order, because every Pokémon of the previous season is back in the general pool. When both Pokémon of a tier are gone, that extension expires by itself. Which extensions a team still holds is on screen throughout the draft, per tier and per team, and a Pokémon secured this way is marked in the draft history.
- **The press understands the system.** The metadata carry the order, the round, and each team's open, redeemed and expired extensions with their candidates, and the canon states the tension: wanting a Pokémon badly gives you good odds, never a guarantee — and two Pokémon of the same tier competing for the same extension is a story worth telling now and then.
- **The winter transfer window has a date again.** It sits exactly between the two legs, and once it has closed no Pokémon changes team until the next draft. The press used to spend the second half of the season speculating about transfers that could no longer happen; it now knows when the window is, what it allows, and that squad criticism in the second leg is about selection and the coming draft, not about signings.

## Season 2 squad pool (new)
- **33 Pokémon join the draft pool**, with their tier derived from the points as usual — from Rillaboom and Mega Salamence at the top down to Swalot and Persian at the bottom, including the Z Mega Evolutions, both Indeedee, both Toxtricity and both Squawkabilly pairings. Types, base speed, dex number and artwork come from the Champions data, and the damage calculator, the Showdown export and the PokéZone links all resolve the new forms.
- **Newcomers are marked as newcomers.** The Pokémon page carries a "Neu ab Saison 2" badge, and the newsroom publishes one piece per pool intake: Scott sorts the arrivals by tier and says what they displace. He is told explicitly what is *not* settled yet — the newcomers have no Elo rating and therefore no market value, and the tiers of the existing Pokémon only move once the season's final Elo is in.

## Press
- **A new desk: Scott.** The builder of the Battle Zone covers scouting, the draft, transfers and squad planning — he watches the trainers he invited himself, judges a squad the way he judges a car, and writes at the speed he drives.
- **Commission an article.** The newsroom can hand the desk a free-text brief: a topic, an angle, a team, a question. The brief decides what the piece is about, never what is true — anything the data do not support is treated as the editors' hunch and checked against the numbers.
- **Nothing valuable falls out of the context any more.** Background pieces used to drop out of the briefing after eight newer articles and were then gone for good. Articles can now be marked as a permanent reference and always travel with the metadata, in full length; anything written by the players themselves and the season review count as references automatically. The recent-article windows grew as well.
- **Every AI request can be tried again.** A failed piece shows which model it was attempted with, lets that model be swapped for the retry, and can be regenerated regardless of where it came from — match report, free article, market update, season review, report card, off-season piece, commission or interview. An interview whose answers are already in is only rewritten, never asked again. Underneath, overload, quota and truncated answers are retried automatically with a growing pause, and a cut-off answer gets more room and less thinking time on the next attempt.

## Statistics
- **A Pokémon signed in the winter did not miss the first leg — it was not there.** Percentages that divide by the team's battles now only count the matchdays a Pokémon actually belonged to the squad, in the tables, on the Pokémon page and in the press metadata. The press is told about it explicitly and may no longer hold missing first-leg appearances against a winter arrival.
- **"Kämpfe % (Kader)" is short again** — the column header reads `Kpf %`.

## Teams
- **A colour per team.** Behind a gear in the team header the owner picks a colour from a palette or the colour field. It carries the header and represents the team in every chart across the app — the placement curve of the table, the team's own curve and the squad-value comparison. Teams without a chosen colour keep a fixed colour derived from their id, so the charts are consistent from the start.
- **The team page reads in the order it is used:** header, squad, trainer, season, market values, Pokémon ranking, notes, speed tiers, weaknesses, draft history. A trainer's personality traits now scroll as a single line instead of taking three.

## Teambuilder
- **Two views instead of four.** "Nur Pokémon" and "Movesets" — the note field moved into the moveset view, where it belongs, and the marking click works in both.
- **The set tiles are built for working in.** A compact header with the sprite, the name, a PokéZone link and a button that clears the set; item and ability side by side; four moves as a 2×2 grid; the stat points below; the note at the bottom. The grid follows the width of the panel, not the window, so a tablet with the sidebar collapsed fits three tiles where two fit with it open.
- **Sets can be cleared.** One Pokémon at a time or both squads at once, each after a confirmation — so the second leg does not start against the first leg's leftovers. Markings, speed settings and the damage calculator are untouched.

## Awards
- **An award is either an honour or a rap on the knuckles.** Each one now carries which it is, the honours board counts both separately, and the records tell "most honours" apart from "most rebukes".

## Navigation
- **Clearer icons** for Tabelle (a table instead of a second bar chart), Spielplan (a calendar of fixtures), Teambuilding (two squads across a centre line), Teams (a crest instead of a second group of people) and Draft (a card being pulled out of the pool).

## Result entry, battle log & video (new)
- **The battle log is written by hand again.** Voice recording is gone — from the result entry and from the Teambuilder, along with the transcription briefing behind it. It never reached the quality the log needs, and a log nobody trusts is worse than no log.
- **The log lives with the result.** It is written in one place only: the battle-log step of the result entry in the schedule. The Teambuilder keeps the matchup note and still shows both players' logs — including the first leg — but read-only.
- **Nothing that was entered can be overwritten by something emptier.** A result document is written whole, so a stale form (opened before the results had loaded, or on a second device) used to be able to replace finished battles with blank ones. Saving now runs in a transaction and merges: a finished battle is never replaced by an unfinished one, an empty squad never replaces a filled one, and fields the form does not know — video, press release — survive untouched. The entry refuses to open at all until the results are there.
- **The log draft is kept on the device.** Every keystroke is mirrored to local storage and restored when the match is reopened, so a failed save or a closed browser costs nothing. Saving is blocked while the stored state is unknown, the text is tied to the match id it was written for, and a failure is now shown on screen instead of only in the console.
- **"Pressefreigabe" — the newsroom waits for a go.** Match reports, the three free articles of a matchday and the market-value update no longer start the moment the third battle is entered. They start when someone confirms that result *and* battle log are final. The button sits in the result entry and in the match detail; the schedule card shows "Presse offen" until then, and the maintenance tab lists what is waiting. Catching up by hand still works for anything complete, released or not.
- **A video per match.** One URL covers all three battles and is entered with the result. The schedule card then carries a play button that opens the video in a popover — YouTube in every notation (watch, youtu.be, shorts, live, embed, with timestamp) plays inline, anything else opens as a link.
- **The press embeds the video.** If a URL is on file before the match is released, the report carries it at the end.

## Press
- **Tiles in the article body.** The newsroom can now place a market-value tile for a Pokémon, a club crest with its squad value, a trainer's photo, a scoreline with both crests and the kill count, or the video of the match — each as its own paragraph, up to three per piece. They are resolved when the article is displayed, not when it is written, so a market value always shows today's figure.
- **A championship is only a championship once it cannot be lost.** The table metadata now carry, per team, the number of fixtures still open and the maximum points still reachable (three per match), and the canon spells out the arithmetic: as long as a chaser can pass on points *or*, level on points, on kill difference, nothing is decided. A three-point lead with a game in hand for second is not a title.
- **The newsroom is allowed to be impressed.** The critical stance stays, but a new, deliberately rare tone makes a genuine achievement the main subject — without the relativising "but" in the last paragraph. Roughly every fourth piece gives a real performance the lead.
- **Fixed: free articles could crash before they started.** The placeholder document read the league store before it was declared and failed with "Cannot access 'l' before initialization"; the article never appeared.

## Records
- **A record shared is a record shared by all.** Where several Pokémon or teams hold the same best mark, every one of them is listed, each with the moment they set it, instead of whichever result happened to be processed first. Ties are compared on rounded values, so K/D and survival rates that look identical are treated as identical.

## Market values
- **The history respects the winter transfer.** Squad value over time used to run today's squad backwards through the whole season, so the first half showed Pokémon that only arrived in the second. The split is now taken from the sheet's "Transfer" column, or from the last matchday of the first leg, and every point before it is computed with the squad as it was: departures are added back, arrivals removed. The squad chart shows a departure up to the transfer and an arrival from it, each labelled.
- **Fixed: percentage changes were a hundred times too high.** The Pokémon page had two `fmtPct` helpers under one name — one for shares (0–1), one for percentages (0–100) — and the later one won.

## Seasons (new)
- **A season switcher in the navigation.** Where the sidebar used to read "Season 1 · Live" there is now a picker: every season the database knows about, plus a cross-season area. The choice is device-local, so both players can be in different places at once, and the live dot only pulses for the newest season.
- **Every season stands on its own.** Table, schedule, squads, draft, transfer, results, press appointments, awards and statistics are scoped to the selected season. The season lives in the document id (`s1-…`), not in a field, so even results — which never carried a `season` — are assigned correctly. Nothing from season 2 will leak into season 1, and nothing from season 1 into season 2.
- **One set of listeners for all seasons.** Drafts, schedules and results now arrive as whole collections and are narrowed by getters, so switching seasons needs no new subscriptions and no reload.
- **A cross-season area**, already usable although only one season exists. It carries what makes sense across seasons and drops what does not: no schedule, no Teambuilder, no teams, no draft, no transfer.
  - **Eternal table.** All seasons folded into one, with a team counting as the same franchise across promotions and relegations (the id keeps its name part). Seasons played, titles, record, kills, best and average placement. A title is only counted once a season is actually finished — the leader of a running season is not a champion.
  - **The seasons at a glance** above the table: champion or current leader, teams, matches, kills.
  - **Statistics** across all seasons, with two extra columns that only exist here: in how many seasons a Pokémon has played and for how many different teams. Columns that only make sense inside a season disappear here, and vice versa.
  - **Awards** become an eternal honours board: who won which award how often, as two leaderboards for Pokémon and teams, plus the complete list of winners by season. Voting stays inside a season, where it belongs.
  - **Players** aggregate across all seasons, with titles, seasons played and average placement per player.
  - **Press** is deliberately identical everywhere — the archive has always been cross-season and stays that way.
- **Records (new view, cross-season only).** Best marks, computed rather than maintained: most kills in one battle and in one match, biggest win, most kills on a matchday, flawless battles, longest winning, unbeaten and losing runs, most points and best kill difference in a season, all-time kills, deaths, appearances, K/D, survival rate and battle win rate, the highest market value, the biggest jump and the biggest drop, the most expensive squad, and the most decorated Pokémon and team. Every record names who holds it and when it was set — in league units (season, matchday, battle), because the league keeps no calendar.

## Press
- **The newsroom now works past the final whistle.**
- **An outlook press conference** for every team once the season is complete — the round before the winter transfer and the draft. Five questions instead of three, two of them deliberately pointed, along a fixed arc: the season's balance, the squad, which Pokémon the team wants to keep (a number, and names), the plan for the draft, and a commitment for next season. Nothing is decided by it: everything said there is an intention, quotable later.
- **The season review**, one long piece in chapters that ties the whole season together — and resolves *every* storyline that was ever opened, naming the open ones as open and handing them to the next season. The metadata block for it carries the final table and the complete storyline history.
- **A season report card per team**, and free off-season articles that are released one at a time — one for each completed outlook press conference, so the break stays in motion instead of arriving as a single dump. All four briefings are editable like the others, and the maintenance tab lists what is still missing.

## Market values (new)
- **Elo becomes a transfer fee.** Every Elo rating from the draft sheet is translated into a market value in euros, the way football talks about a squad. The curve is anchored on ten fixed points (1100 Elo = 300 Tsd. €, 1600 = 10 Mio. €, 1900 = 100 Mio. €, 2100 = 200 Mio. €) and interpolated logarithmically in between, so the anchors are hit exactly and the values escalate towards the top while the bottom corridor stays tight. Amounts are rounded in steps — 10k below a million, 100k below two, 500k below ten, one million below fifty, five million above.
- **The market value leads, Elo follows in brackets.** The Elo tab is now *Marktwerte*, the ranking sorts by value, the Pokémon page opens with the amount and keeps Elo and rank as a small line underneath, team cards and the team header carry the squad value. Only the statistics tables keep the two as separate, independently sortable columns.
- **"Marktwert-Update starten" instead of a refresh button.** Reloading the sheet now ends in a staged presentation in the style of the award ceremonies: the total value of the league counts up, every tier change is revealed one at a time in full size with old and new value, absolute and percentage change, and the five biggest winners and losers follow as a ranked list. It compares against the state this device last saw — not against the matchday — because the sheet is often updated after a single game. The last update can be replayed at any time, and everything can be skipped.
- **The staging is built for the phone.** Only ever one element in the middle of the screen, a grid with a fixed header and footer and a scrolling middle, nothing with a minimum width, no horizontal overflow.
- **History from the sheet.** Everything to the right of the tier column — S1 Pre, S1 Draft, S1 MD1 … S1 Post — is read as a timeline. New columns appear without a code change; empty cells count as "not reached yet".
- **Interactive charts.** The Pokémon page draws its market-value curve with the tier boundaries as coloured bands and a ring on every point where the tier changed. The team page adds two more: the total squad value of all eight teams over time with the team in question highlighted, and every Pokémon of the squad as its own line. The teams overview carries the same comparison without a highlight. Pointing or tapping sets a guide line and names the exact values; lines can be switched off from the legend. The charts are drawn in real pixels and redrawn on resize, so the labels stay legible on a phone and nothing ever gets wider than its container.
- **A market value report after every matchday.** As soon as every fixture of a matchday has a result *and* the sheet carries the new values for it, the newsroom publishes "Marktwert-Update nach Spieltag X": which performance made which Pokémon more expensive, every tier change with its reading, the biggest movers by amount and by percentage, and the squad values against the table. The briefing is editable like the other six.
- **The sticky column of the market ranking is opaque again.** The tint of a tier change used to overwrite the background of the pinned rank column, so the text behind it showed through while scrolling sideways; the tint now sits in `background-image` and the column keeps its own colour.
- **`marktwert-entwurf.html`** previews the conversion, the charts and the staging against live sheet data — the same code the app runs, no login needed.

## Press
- **Mobile overflow fixed.** Long words in headlines, standfirsts, excerpts, article bodies and in the editor now break instead of pushing the layout sideways; tables and code inside an article scroll on their own.
- **Character selection no longer bursts its card.** Trainer personalities turned out to be much longer than the single truncated line allowed for, so the traits wrap over up to three lines and the press stage clips horizontally as a backstop.

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
