# Simulation model

FieldCraft rates fields with a ball-by-ball Monte-Carlo engine in `js/sim.js`. This page explains what it models, what each input changes, and where its limits are.

## Pipeline for one ball

1. **Delivery.** A length (yorker, full, good, back of a length, short) and a line (wide, off/4th stump, stumps, pads) are drawn from the **bowling plan**:
   - On *Auto*, the plan depends on the phase and the bowler type. Death overs, for example, get a high share of yorkers.
   - Pace bowlers bowl slower balls: 7% in the powerplay, 16% in the middle overs, 24% at the death.
   - Spinners bowl variations, such as the googly or the arm ball, 10–15% of the time.
2. **Shot choice.** One of 25 shots is chosen. Each shot's weight is the product of:
   - how well it suits the length and line,
   - how well it suits the bowler type (sweeps against spin, hooks against pace),
   - an aggression factor that depends on the phase and the batter profile,
   - the profile's preferences (off-side player, sweeper, and so on),
   - a **gap factor**: batters favour shots that go towards open areas of your field.
3. **Execution.** The chance of a mistake grows with:
   - the shot's base risk,
   - a poor match between shot and delivery,
   - seam movement × swing × ball age (pace),
   - turn × dew × ball age (spin),
   - variable bounce,
   - a slow, gripping surface (this hurts lofted shots most),
   - a batter-friendly pitch, which works the other way.

   A mistake turns into an outside edge, bat-pad, leading edge, inside edge, top edge, mistime or miss, depending on the shot type and the conditions.
4. **Flight.**
   - **Ground balls** leave the bat with a speed set by the shot's power, the batter's power, the bowler's pace and the pitch pace, then slow down under outfield friction (1.8–4.2 m/s²).
   - **Aerial balls** have a carry distance and a hang time. Edges carry according to the bowler's speed and the pitch bounce: about 21 m off a fast bowler, about 2.5 m off a spinner.
   - A **clean shot is placed**: the batter tries a couple of directions and keeps the one furthest from a fielder.
5. **Fielding.** All ten fielders and the bowler can take part.
   - **Catch:** a fielder can reach a catch within `reaction + run speed × hang time + stretch`. Fast edges are limited to about 2.8 m of lateral reach. Catch probability falls off towards the edge of a fielder's reach, and is lower for flat, hard hits and skiers.
   - **Ground stop:** the ball is intercepted at the first point where some fielder gets there first (reaction 0.2–0.3 s, 6.6 m/s, 1.9 m dive). Close fielders get very little reach against hard-hit balls. Misfields happen 2.5–7% of the time.
   - **Runs** come from the time taken to collect and return the ball, compared with how long the batters need to run. White-ball batters run harder.
   - **Boundaries:** a ball that passes every fielder is a **4**. A ball that carries the rope is a **6**, unless it only just clears it and a fielder is close enough for a boundary catch.
   - **Wickets** that don't involve a fielder: bowled, LBW, and stumped (only when the keeper is standing up to spin).

## Fair comparisons

Ball *i* uses the seed `seed + i × constant` for every field being compared. All fields therefore face the same sequence of deliveries and shot choices, so differences in the results come from fielder positions and not from luck. These are called common random numbers.

## Net score

```
net = runs per over − wicketValue × objectiveMultiplier × wickets per over
```

Lower is better for the fielding side.

| Format | Default wicket value |
|---|---|
| T20 | 6–10 runs, by phase |
| ODI | 10–20 runs |
| Test | about 30 runs |

The objective multiplier is 1 for *Balanced*, 1.8 for *Take wickets* and 0.45 for *Stop runs*.

## Optimiser

The optimiser is a greedy hill-climb:

1. Try every single move: each of the 9 outfielders to each of the 44 named positions. Moves that break a fielding restriction or land on an occupied spot are skipped.
2. Evaluate each move on 450 balls using common random numbers.
3. Apply the best move if it improves the score by more than 0.03.
4. Repeat, up to 5 passes.
5. Check the final field against the original on 3,000 fresh deliveries.

## Calibration

These are typical outputs with the standard field for each situation and a balanced pitch:

| Situation | Runs per over | Balls per wicket |
|---|---|---|
| T20 powerplay, pace | ≈ 8.0 | ≈ 23 |
| T20 middle overs, off-spin | ≈ 6.3 | ≈ 20 |
| T20 death, medium pace | ≈ 8.9 | ≈ 18 |
| ODI middle overs, medium pace | ≈ 4.7 | ≈ 47 |
| Test, new ball, pace | ≈ 3.4 | ≈ 47 |
| Test, new ball, green seamer | ≈ 3.2 | ≈ 28 |

The test suite in `tests/run.test.js` checks that these numbers stay in realistic ranges and that the expected effects hold. For example, a green pitch must produce more wickets than a flat one, and the slip cordon must take wickets.

## Known limitations

- Extras (wides, no-balls, byes), run-outs and overthrows aren't modelled.
- Batter profiles are archetypes, not individual players.
- Dusty Test pitches with spin come out bowler-friendly, at about 2 runs per over.
- Use the results to compare fields under the same conditions, not to forecast exact scores.
