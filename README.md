# FieldCraft — Cricket Field Simulator

A professional, **voice-controlled** cricket field-setting and simulation tool. Set fields for any bowler, batter, pitch and match phase. Move fielders by speaking ("*move long-on to mid-on*"). Load tactical traps. Then let a ball-by-ball Monte-Carlo engine tell you, statistically, which field works best on which pitch.

Runs entirely in the browser: no build step, no external dependencies, works offline (PWA).

![FieldCraft](assets/icon.svg)

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbilalahmadsheikh%2FCricket)

It's a static site with no build step. In Vercel choose **Add New → Project**, import this repo, keep the defaults (Framework: *Other*, no build command, output directory `.`) and deploy. Vercel serves over HTTPS, so the microphone works.

## Quick start

```bash
node serve.js 8080
```

Open <http://localhost:8080> in **Chrome, Edge or Safari**, which have speech recognition. Press the mic button, press **M**, or hold **Space**, then speak. Everything you can say, you can also type in the command bar (press **/** to focus it).

> You can open `index.html` straight from disk too. Some browsers only allow microphone access on `http://localhost` or `https://`, though, so use the server if you want voice.

Run the tests:

```bash
npm test
```

## Features

| Area | What you get |
|---|---|
| **Field setting** | 45 named positions: slips 1–4, gully, fly slip, leg slip, silly point, short leg, the ring, sweepers and every boundary position. Drag-and-drop, tap-to-place, a per-fielder position picker, keyboard arrows, and snap-to-named-position. |
| **Voice control** | Natural phrasing that copes with speech-recognition mistakes ("long on **2** mid on", "find leg", "galley"). You can chain commands with "and", rename fielders and refer to them by name, and turn on an optional wake word ("Captain, …"). It speaks its replies, and you can pick your accent (UK, India, Australia, Pakistan, South Africa, NZ, US). |
| **Bowlers** | Fast, medium-fast, off-spin and leg-spin, each **left- or right-arm**. Bowl over or around the wicket. Spin is modelled as turning *into* or *away from* the batter, and pace as angling *across* or *into*. |
| **Batters** | Right- or left-handed. Positions are batter-relative, so **every field mirrors automatically for a left-hander**. There are 8 batter profiles: power hitter, anchor, off-side or leg-side player, weak vs the short ball, sweeper and tail-ender. |
| **Phases & restrictions** | T20 (powerplay, middle, death), ODI (PP1, middle, death) and Test (new ball, old ball, declaration). The 30-yard circle limits and the Law 28.4 limit (max 2 behind square on the leg side) are checked live, and illegal fielders are flagged. |
| **Pitches & conditions** | Balanced, green seamer, flat road, dry turner, dusty/crumbling, hard & bouncy, slow & low, damp. You can also set overcast/humid skies, dew, new or old ball, outfield speed and boundary size. |
| **Fields & traps** | 24 standard fields plus 14 traps: bouncer/hook, leg-side, drive bait, off-side stack, wide-yorker, leg-stump yorker, slower-ball, upper-cut, umbrella, sweep, reverse-sweep, googly, flight & dip, and ring field. Each one carries its matching bowling plan. |
| **Simulation** | You can bowl a single animated ball with commentary, bowl an over, or simulate 600–12,000 balls. Results include a run heat-map (danger zones), a wagon wheel, dismissal mix, shot breakdown, fielder workload and plain-English insights ("28% of boundaries leak through long-off"). |
| **Shot focus** | Test a field against one shot: cover drive, pull, sweep, reverse sweep, ramp and 20 others. |
| **Analytics** | **Rank fields** ranks every suitable field and trap for the current conditions. **Pitch matrix** shows which field is best on each pitch type. **Optimise** runs a greedy search that moves one fielder at a time and checks the result on fresh deliveries. You can set the objective to balanced, take wickets, or stop runs. |
| **Workflow** | Undo/redo, save named fields, export/import JSON, PNG export, printable field card, shareable link and light/dark mode. Works on phones and tablets. |

## Voice command reference (examples)

| Intent | Say… |
|---|---|
| Move | "move long on to mid on" · "put fine leg at short fine leg" · "third man to second slip" · "move fielder 3 to gully" · "move Smith to deep mid-wicket" |
| Adjust | "bring mid-off up" · "push fine leg back" · "move point a bit squarer" · "cover finer" · "keeper up" |
| Add a catcher | "add a slip" · "bring in a short leg". The simulator picks the fielder whose move costs the least. |
| Swap / mirror | "swap point and cover" · "mirror field" |
| Fields & traps | "load the death field" · "bouncer trap" · "sweep trap" · "wide yorker trap" · "ring field" · "load the best field" |
| Situation | "T20" · "one day" · "test match" · "powerplay" · "outside the powerplay" · "death overs" · "left hander" · "switch batter" |
| Bowler | "right arm leg spinner" · "left arm orthodox" · "left arm fast" · "medium pacer" · "around the wicket" |
| Conditions | "green pitch" · "the pitch is dusty" · "flat track" · "overcast" · "dew" · "fast outfield" · "small boundaries" |
| Plan / batter | "bowl short" · "bowl yorkers" · "fourth stump channel" · "power hitter batter" |
| Simulate | "bowl" · "bowl an over" · "simulate 1000 balls" · "simulate cover drive" · "simulate 5 overs of pull shots" |
| Statistics | "which field is best?" · "compare pitches" · "optimise the field" → "apply" · "analyse this field" |
| Info / view | "where is mid on?" · "read the field" · "is the field legal?" · "zoom in" · "show heatmap" · "dark mode" · "undo" · "help" |

## How the simulation works

`js/sim.js` simulates each delivery in five steps:

1. **Delivery.** It draws a length (yorker, full, good, back of a length, short) and a line (wide, 4th stump, stumps, pads) from the bowling plan. Pace bowlers mix in slower balls and spinners mix in variations.
2. **Shot choice.** It picks one of 25 shots. The choice depends on the delivery, the phase's aggression, the batter profile, and the **gaps in your field**, because batters target open areas.
3. **Execution.** The shot is either clean or goes wrong: an edge, top edge, leading edge, bat-pad, inside edge, mistime or miss. The odds depend on the pitch (seam, turn, bounce, variable bounce, grip), the overhead swing, the ball's age, the bowler's speed and the batter's control.
4. **Flight.** A ground ball slows down under outfield friction. An aerial ball has a carry distance and a hang time. Edges travel at speeds that depend on the bowler's pace, so the slips' depth matters.
5. **Fielding.** Every fielder, including the keeper and the bowler in their follow-through, has a reaction time, sprint speed and dive reach. A fielder who can reach the ball either catches or drops it, or stops it. Runs come from the time it takes to collect and return the ball. Anything that passes every fielder goes for 4, and anything that clears the rope goes for 6.

All comparisons use *common random numbers*: ball *i* gets the same seed in every field. Differences between fields therefore come from the fielding positions and not from luck. The model is calibrated to typical rates:

- T20 powerplay: about 8 runs per over, a wicket every 20–25 balls.
- ODI middle overs: about 4.8 runs per over.
- Test new ball: about 3.3 runs per over, a wicket every 45–50 balls.
- Green seamers and dusty turners shift these numbers as you'd expect.

Use it to **compare fields under identical conditions**, not to predict exact scores.

The "net score" is runs per over minus *wicket value × wickets per over*. Lower is better for the fielding side. The wicket value defaults to roughly 6–10 runs in T20, 10–20 in ODIs and about 30 in Tests, and the objective selector scales it.

## Project structure

```
index.html            App shell
css/styles.css        Styles (light/dark, responsive)
js/core.js            RNG, geometry, ground model, 30-yard ring
js/positions.js       Position catalogue, voice aliases, classification
js/conditions.js      Formats/phases, pitches, bowlers, batters, plans, shots
js/presets.js         Field presets and traps
js/field.js           Field model, fielding-restriction checks, mirroring
js/sim.js             Ball-by-ball simulation engine
js/analytics.js       Ranking, pitch matrix, optimiser, insights
js/voice.js           Command parser + Web Speech API wrapper
js/render.js          SVG field renderer (drag, heat-map, wagon wheel, animation)
js/app.js             Application controller
tests/run.test.js     Node test suite (geometry, rules, engine calibration, parser)
serve.js              Zero-dependency local web server
sw.js, manifest       Offline / installable PWA
```

## Coordinate convention

Positions are stored relative to the batter on strike. θ = 0° is straight back past the bowler, +90° is square on the off side, −90° is square on the leg side, and ±180° is the keeper. Distance d is measured in metres from the striker's stumps. The field view shows the batter at the top and the bowler at the bottom, like the TV view from behind the bowler. For a right-hander the off side is on the left of the screen.

## Browser support

- **Voice input:** Chrome, Edge, Safari (desktop and mobile), using the Web Speech API. Firefox has no speech recognition, but typed commands work there.
- **Everything else:** any modern browser.

## License

MIT
