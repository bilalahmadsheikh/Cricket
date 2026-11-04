# Architecture

FieldCraft is a static, framework-free web app with no build step and no runtime dependencies. Each JavaScript file is a classic script that adds its exports to a shared `CFS` namespace. The browser loads them with plain `<script>` tags, and Node loads the same files with `require()` for the tests.

## Modules (in load order)

| File | Responsibility | Depends on |
|---|---|---|
| `js/core.js` | Seeded RNG (mulberry32), maths helpers, polar ↔ cartesian conversion, ground ellipse, 30-yard ring geometry, Levenshtein similarity | none |
| `js/positions.js` | Catalogue of 45 fielding positions (θ, depth, zone, voice aliases), position spots for a given ground and keeper stance, nearest-position classification, fuzzy position matching | core |
| `js/conditions.js` | Formats and phases with restrictions and aggression, pitches, outfields, overhead conditions, bowlers, batter profiles, bowling plans, the 25-shot catalogue | core |
| `js/presets.js` | 24 fields and 14 traps; how well a preset fits a situation | conditions |
| `js/field.js` | Field model, building fields from presets, keeping player identity across presets, legal-spot clamping, rule checks, mirroring | positions |
| `js/sim.js` | Simulation context, field preparation, ball simulation, batch evaluation, commentary | everything above |
| `js/analytics.js` | Objective score, ranking, pitch matrix and optimiser (written as generators), insights | sim |
| `js/voice.js` | Text normalisation, command parser, `VoiceControl` wrapper around `SpeechRecognition` and `speechSynthesis` | positions, presets, conditions |
| `js/render.js` | `FieldView`: SVG drawing, drag and tap-to-place, snapping, heat-map, wagon wheel, ball animation, PNG export | core, positions |
| `js/app.js` | Application state, undo/redo, persistence, command executor, panels, analytics jobs, export and share | everything |

## Coordinate frame

Positions are stored **relative to the batter on strike**:

- θ = 0° is straight down the ground, +90° is square on the off side, −90° is square on the leg side, and ±180° is the keeper.
- d is the distance in metres from the striker's stumps.

Because of this, one preset works for both right- and left-handers. The renderer simply flips the x-axis: `screenX = offSign · d·sinθ`, where `offSign` is −1 for a right-hander and +1 for a left-hander.

The ground is an ellipse centred on the middle of the pitch, with semi-axes `a` (square) and `b` (straight).

## State and data flow

```
user input (mouse / keyboard / voice / text)
        │
        ▼
 parseCommand()  ──►  execute(cmd)  ──►  state.s (settings) / state.field
                                              │
                                              ├─► saveStore()  (localStorage)
                                              └─► renderAll()  ─► FieldView.render(), panels
```

- Every change to the field goes through `setField()`, `loadPreset()` or `moveFielder()`. These push a snapshot onto the undo history.
- Long analytics jobs are generator functions. The UI runs them with `runAsync()` in 30 ms slices, which keeps the page responsive and supports cancel. The tests run them with `runSync()`.

## Persistence

| Key / location | Contents |
|---|---|
| `localStorage['fieldcraft.v1']` | Settings, the current field, saved fields |
| `localStorage['fieldcraft.seenHelp']` | Whether the first-run help has been shown |
| Share links (`#s=<base64 JSON>`) | Settings and field |

## Offline / PWA

`sw.js` uses a network-first strategy that falls back to the cache, so updates appear right away and the app still works offline. The service worker is only registered over HTTP(S).

## Testing

`npm test` runs `node --test tests/run.test.js`. The suite covers:

- geometry
- position classification and voice aliases
- preset validity and fielding rules
- simulation determinism and calibration ranges
- how pitch and field affect the results
- left-hand mirroring
- analytics ordering and the optimiser
- the command parser
