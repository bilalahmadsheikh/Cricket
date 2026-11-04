# Voice & text command reference

Spoken and typed commands go through the same parser in `js/voice.js`. Matching is fuzzy, so common speech-recognition errors still work. The browser returns up to five alternative transcriptions, and the first one that parses is used.

## Referring to fielders

You can name a fielder in any of these ways:

- **By the position they are standing at:** "mid on", "first slip", "deep square leg"
- **By number:** "fielder 3", "number 3", "player 3"
- **By name:** "Smith", once you've renamed a fielder
- **The keeper:** "keeper"

If nobody is at the position you name, FieldCraft tells you who is nearest and doesn't move anyone.

## Positions understood

| Area | Positions |
|---|---|
| **Close / catching** | keeper, first slip to fourth slip, gully, fly slip, leg slip, leg gully, short leg (bat pad), backward short leg, silly point, silly mid-off, silly mid-on, short cover, short extra cover, short mid-wicket, short fine leg, short third man |
| **Ring** | backward point, point, cover point, cover, extra cover, mid-off, mid-on, mid-wicket, square leg, backward square leg |
| **Deep** | third man, fine third man, deep backward point, deep point, deep cover point (sweeper), deep cover, deep extra cover, long-off, straight hit, long-on, cow corner, deep mid-wicket, deep square leg, deep backward square leg, long leg, fine leg |

Common mishearings that are handled include "mid one", "long of", "find leg", "galley", "mid wicked", "square lake" and "3rd man".

## Delivery analysis

| Say | Answer |
|---|---|
| "what shot was that?" · "how did he get out?" | The last ball: speed, length, line, the shot played (and any edge or mistime), the result and where it went. |
| "what happens on 4th stump good length?" | Runs per over and wickets for that delivery in the last simulation, the shots batters played to it, and which shots went for boundaries or got them out. A simulation runs first if needed. |
| "shots against yorkers" · "what do they play on middle stump?" | The same breakdown across one length or one line. |

Lines: wide (6th stump+), 5th stump, 4th stump / channel, off stump, middle, leg stump, down leg / at the body.
Lengths: yorker, full toss, full, good length, back of a length, short / long hop, bouncer.

## Circle & boundary moves

These moves keep the fielder's angle and change only their depth, measured against the real 30-yard circle and the rope.

| Say | Result |
|---|---|
| "move third man **inside the circle**" | Moves to the named ring position at that angle (third man → short third man). If there's no named position, the fielder goes just inside the circle. |
| "move short third man **outside the circle**" | Moves to the named deep position at that angle (short third man → third man). If there's no named position, the fielder goes to the boundary. |
| "put point **on the edge of the circle**" · "just inside the ring" | Moves to just inside the 30-yard line. |
| "fine leg **just outside the circle**" | Moves to about 3 m outside the line. |
| "move mid-off to the **middle of the circle**" | Moves halfway between the bat and the circle. |
| "put long-on **in the middle of the circle and boundary**" · "halfway between the circle and the boundary" | Moves halfway between the circle and the rope. |
| "send square leg **to the boundary**" · "to the rope" | Moves onto the boundary. |

## Forgiving language

- **Typos and mishearings are repaired.** Unknown words are matched to the closest known word by spelling or by sound. For example, "mvoe the pitch to grene" becomes "move the pitch to green", and "wich feild is best" becomes "which field is best". The app tells you what it understood.
- **The most similar match wins.** Names like "thurd man", "scare leg", "long gone" and "cover pint" resolve to the closest position.
- **When nobody stands at a position**, the nearest fielder is used. For example, "move long on to mid on" with no long-on uses the closest fielder, and the app says who it moved. Say "undo" if that's not what you meant.
- **Numbers can be spoken as words:** "fielder three", "number five".
- **If a phrase isn't understood**, the app suggests the closest command ("Did you mean …?"). Say **"yes"** to run it.

## Commands

| Category | Examples | What happens |
|---|---|---|
| Move | "move long on to mid on" · "put fine leg at short fine leg" · "shift third man over to second slip" · "long on to mid on" | The fielder moves to the named position. |
| Nudge | "bring mid off up" · "push fine leg back" · "point a bit squarer" · "cover finer" · "mid on straighter" | The fielder moves one depth band in or out (close, ring, deep), or rotates 12°. Adding "a bit" makes the move smaller. |
| Add | "add a slip" · "bring in a short leg" · "I want a leg gully" | The simulator moves whichever fielder costs least to give up. |
| Swap | "swap point and cover" | |
| Keeper | "keeper up" · "keeper back" · "stand up" | |
| Fields | "load the death field" · "powerplay field" · "ring field" · "reset field" · "mirror field" | |
| Traps | "bouncer trap" · "leg side trap" · "drive trap" · "off side stack" · "wide yorker trap" · "leg stump yorker trap" · "slower ball trap" · "upper cut trap" · "umbrella" · "sweep trap" · "reverse sweep trap" · "googly trap" · "flight trap" | The trap's field and its bowling plan are both loaded. |
| Format & phase | "T10" · "ten over match" · "T20" · "twenty twenty" · "ODI" · "one day" · "test match" · "powerplay" · "outside the powerplay" · "middle overs" · "death overs" · "new ball" · "old ball" | |
| Batter | "left hander" · "right hander" · "switch batter" · "power hitter batter" · "anchor batter" · "tail ender batter" · "batter weak against the short ball" | |
| Bowler | "right arm fast" · "left arm fast" · "medium pacer" · "left arm medium fast" · "off spinner" · "left arm orthodox" · "right arm leg spinner" · "chinaman" · "around the wicket" · "over the wicket" | |
| Pitch | "green pitch" · "flat track" · "it's a turner" · "the pitch is dusty" · "bouncy pitch" · "slow pitch" · "damp pitch" · "balanced pitch" | |
| Conditions | "overcast" · "sunny" · "humid" · "dew" · "no dew" · "fast outfield" · "slow outfield" · "small boundaries" · "big boundaries" | |
| Bowling plan | "bowl short" · "bowl yorkers" · "bowl wide" · "fourth stump channel" · "stump to stump" · "into the body" · "toss it up" · "darts" · "auto plan" | |
| Simulate | "bowl" · "next ball" · "bowl an over" · "simulate 1000 balls" · "simulate 5 overs" · "simulate cover drive" · "simulate 5 overs of pull shots" · "any shots" | |
| Statistics | "which field is best?" · "load the best field" · "compare pitches" · "optimise the field" · "apply" · "analyse this field" | |
| Info | "where is mid on?" · "read the field" · "is the field legal?" · "how many are outside?" | |
| Names & saving | "rename fielder 3 to Smith" · "fielder 4 is Khan" · "save field as new ball plan" · "load new ball plan" | |
| View | "zoom in" · "zoom out" · "show heatmap" · "hide wagon wheel" · "hide labels" · "dark mode" · "open the analytics tab" | |
| Control | "undo" · "redo" · "help" · "be quiet" · "talk to me" · "stop listening" | |

## Wake word

When **Require wake word "Captain"** is on, only phrases that start with "Captain" or "Skipper" are treated as commands, e.g. "Captain, move point to gully". Everything else is ignored silently.

## Chaining

Join commands with "and", "then", "also" or a comma: "left hander and bouncer trap", or "move gully to point, then simulate an over".
