# Changelog

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
