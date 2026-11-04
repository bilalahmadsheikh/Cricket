# User guide

This guide walks through FieldCraft screen by screen. For the full list of spoken commands, see [voice-commands.md](voice-commands.md).

## Screen layout

| Area | Purpose |
|---|---|
| **Top bar** | Shows the current situation as chips: format, phase, bowler, batter hand, pitch, and a forced shot if one is set. Also has the theme toggle and Help. |
| **Left panel: setup** | Match (format and phase), Bowler (type, over or around the wicket, bowling plan), Batter (hand and profile) and Conditions (pitch, overhead, ball age, outfield, boundary size, dew). |
| **Centre: field** | The field diagram. The batter is at the top and the bowler at the bottom, like the TV view from behind the bowler. The toolbar above it loads fields and traps and has undo, redo, mirror, save, export and the layer toggles. The rule bar below it shows whether the field is legal. |
| **Right panel: tabs** | **Fielders**: a list of fielders with names and positions. **Simulate**: bowl balls or overs, or run a large simulation. **Analytics**: rank fields, build the pitch matrix, optimise. **Voice**: language, recent commands and a clickable command reference. |
| **Bottom bar** | The mic button, the typed command box and suggested commands. |

## 1. Set the situation

1. Pick **Format** and **Phase**. The note under them shows the fielding restriction that applies.
2. Pick the **Bowler type** and whether they bowl over or around the wicket. The note underneath tells you whether the ball turns or angles *into* or *away from* the batter.
3. Pick the batter's **hand** and **profile**.
4. Pick the **pitch** and the other conditions. A one-line tactical tip appears under the pitch.

If the current field came from a preset, changing the bowler type or the phase loads the recommended field automatically. If you've edited the field yourself, you get a suggestion instead, with a **Load it** button.

## 2. Set the field

You can move fielders in any of these ways:

- **Drag** a fielder. While you drag, a label shows the name of the position under it. With snapping on (⌖), it locks onto named positions.
- **Tap** a fielder, then **tap a spot** on the field. This works well on phones and tablets.
- In the **Fielders tab**, choose a position from a fielder's dropdown. You can also type a name for each player.
- Select a fielder with Tab and move it with the **arrow keys**. Hold Shift for bigger steps.
- Use your **voice**, e.g. "move long-on to mid-on".

To load a ready-made field, use the **Field** dropdown at the top. It's grouped into fields recommended for this situation, traps, other fields for this bowler, and your saved fields. Loading a trap also sets the bowling plan that goes with it.

Toolbar buttons:

- **↶ ↷** undo and redo. Ctrl+Z and Ctrl+Y also work.
- **⇋** mirror: swaps the off and leg sides.
- **💾** save the field under a name.
- **⋯** export as JSON, import JSON, download a PNG, copy a share link, print a field card.
- **Aa** labels · **🔥** heat-map · **✳** wagon wheel · **⌖** snap · **🔍** zoom to the batting end.

### Colours

- Blue: fielder inside the 30-yard circle.
- Teal: fielder outside the circle.
- Orange: wicket-keeper.
- Red outline: this fielder breaks a fielding restriction.

## 3. Simulate

- **Bowl 1 ball** animates a single delivery. The ticker shows the delivery, the shot and the result.
- **Bowl an over** bowls six balls and shows them as chips.
- **Run simulation** plays 600 to 12,000 balls. It reports runs per over, balls per wicket, dot-ball %, boundary %, chances and drops, and a net score. It also gives plain-English insights, the mix of dismissals, a breakdown by shot and each fielder's workload.
- **Shot focus** makes the batter play one shot only. Use it to test how well a field stops, say, the pull or the sweep.

After a simulation the **heat-map** turns on. It colours each 15° slice of the ground by how many runs went through it. Turn on the **wagon wheel** to see individual shots:

- Blue: four.
- Purple: six.
- Yellow: 1–3 runs.
- Red: out.
- Dashed line: the ball was in the air.

## 4. Analytics

- **Objective** sets what "best" means: *Balanced*, *Take wickets* (wickets weighted more heavily) or *Stop runs*.
- **Rank fields** simulates every suitable field and trap on the same 2,400 deliveries and ranks them by net score. Your current field is highlighted. Click **load** next to any row to use that field.
- **Pitch matrix** runs every field on every pitch type and stars the best field for each pitch. It answers "which field should I use on which surface?"
- **Optimise field** searches for the single fielder moves that improve the current field, then checks the result on 3,000 fresh balls. Click **Apply**, or say "apply", to use it. Hold **Preview** to see it before applying.

## 5. Voice

1. Open the app in Chrome, Edge or Safari, over HTTPS or on `localhost`.
2. Click the mic, press **M**, or **hold Space** to talk only while the key is down. Allow microphone access when the browser asks.
3. Speak naturally. The app answers out loud and logs each command in the Voice tab.

Tips:

- Choose your accent in the Voice tab for better recognition.
- Turn on **Require wake word "Captain"** in a noisy dressing room. Then only phrases that start with "Captain…" are treated as commands.
- You can chain commands: "move long on to mid on **and** fine leg to short fine leg".
- Say "help" at any time.

## Saving and sharing

- Saved fields are stored in your browser.
- **Copy share link** puts the whole setup (situation and field) into a URL.
- **Export JSON** gives you a file that another FieldCraft user can import.
