# Changelog

## 1.2.0 — 2026-11-04

### Added

- **Fine delivery model**
  - 7 lines × 7 lengths, including full tosses and bouncers.
  - Speed in km/h for every ball.
  - Every ball records the shot played, the edge or mistime if any, the result and where it went.
- **Line & length map** with a click-to-drill shot breakdown for each cell.
- **Tables:** boundary and wicket sources by delivery and shot, plus a filterable ball-by-ball log.
- **Voice questions:** "what shot was that?", "what happens on 4th stump good length?", "shots against yorkers".
- **More data**
  - Shots: 4 new (lofted on-drive, whip over mid-wicket, switch hit, chip over the infield), 29 in total.
  - Positions: 3 new (short mid-on, short mid-off, deep forward square leg), 48 in total.
  - Bowlers: express pace, right and left arm.
  - Pitches: abrasive (reverse swing) and cracked.
  - Batter profiles: finisher, weak vs spin, weak vs pace.
  - Fields: T10 powerplay field, powerplay short-ball plan, attacking white-ball spin ring, and a leg-stump whip trap.


## 1.1.0 — 2026-11-04

### Added

- **T10 format**
  - Powerplay is overs 1–2, with at most 2 fielders outside the circle.
  - Middle (overs 3–7) and death (overs 8–10) allow 5 outside.
  - Batters are more aggressive, wickets are valued lower, and running between the wickets is faster.
- **Circle and boundary moves**
  - Inside or outside the circle snaps to the named position at the same angle, e.g. third man ↔ short third man.
  - Also: edge of the circle, just outside, middle of the circle, halfway between the circle and the boundary, and to the boundary.
- **Forgiving language**
  - Phonetic and edit-distance position matching ("thurd man", "long gone", "cover pint").
  - Spelling and mishearing repair, reported back to the user.
  - Best-guess matching that picks the most similar name.
  - The nearest fielder is used when nobody is at the named position.
  - Spoken numbers work ("fielder three").
  - "Did you mean…?" suggestions, confirmed by saying "yes".

## 1.0.0 — 2026-11-04

First release.

### Added

- **Field setting**
  - 45 named fielding positions.
  - Move fielders by dragging, tap-to-place, the position picker, keyboard arrows, or voice.
  - Positions are relative to the batter, so fields mirror automatically for left-handers.
  - Fielding restrictions are checked live: 30-yard circle limits for each format and phase, and Law 28.4 (at most 2 fielders behind square on the leg side).
- **Bowlers and batters**
  - Fast, medium-fast, off-spin and leg-spin, left and right arm, over or around the wicket.
  - Nine bowling plans.
  - Eight batter profiles.
- **Conditions**
  - Eight pitch types.
  - Overhead conditions, dew, ball age, outfield speed and boundary size.
- **Fields:** 24 standard fields and 14 tactical traps, each with its own bowling plan.
- **Simulation**
  - Ball-by-ball engine with ball and over animation and commentary.
  - Batch simulations, heat-map, wagon wheel, insights, and a shot-focus mode.
- **Analytics:** field ranking, pitch × field matrix, and a greedy field optimiser that verifies its result.
- **Voice and text control**
  - Natural-language commands with fuzzy matching.
  - Chained commands, optional wake word, spoken replies, accent selection.
- **Tools:** undo/redo, saved fields, JSON import/export, PNG export, share links, printable field card.
- **App:** offline-capable PWA, responsive light/dark UI, Vercel configuration.
- **Tests and docs:** Node test suite, plus documentation in `docs/`.
