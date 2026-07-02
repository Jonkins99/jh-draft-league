# Changelog

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
