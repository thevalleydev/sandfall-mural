# Sandfall Mural (prototype)

A portrait, one-thumb puzzle: each level is a pixel-art picture made of colored sand. Tap a collector to send it around the belt. It eats grains of its color, and the rest of the sand falls and settles. A collector that finishes its lap with capacity left parks in one of 5 slots. If a collector comes back and every slot is full, you lose.

This is the **Phase 1 prototype**. It answers one question: **does falling sand make the puzzles feel plannable, or random?** It has scoring, personal bests, sharing and sound, but no ads, accounts or daily level yet.

## Run it

```sh
npm install
npm run dev        # http://localhost:5180, also served on your LAN
```

Open the `Local` URL on this computer. To play on a phone, connect it to the same Wi-Fi and open the `Network` URL Vite prints (e.g. `http://192.168.x.x:5180`). The port is fixed at 5180 so it doesn't collide with other local projects on 5173. If the phone can't connect, allow Node through Windows Firewall for private networks.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit tests, plus a bot that checks every level is winnable under every rule |
| `npm run balance` | Writes `scripts/balance-report.md`: greedy, planner and random bots per level and rule (a few minutes) |
| `npm run par` | Regenerates `src/par.json` (~40 s). Run after changing levels or `src/config.ts` (a unit test fails until you do), and bump `SCORING_VERSION` in `src/par.ts` first if you change the bots or the scoring |
| `npm run typecheck` | TypeScript only |
| `npm run build` | Production build into `dist/` |

URL parameters: `?level=4&rule=top` jumps straight to a level and rule.

## The three reach rules

The game's open design question is which grains a collector can reach. The rule picker at the top switches between:

- **Line of fire:** the belt circles the board, and the collector eats the first run of its color from each side. Another color blocks it.
- **Exposed:** the belt circles the board, and the collector eats any grain of its color that touches empty space, seeing through other colors.
- **Top only:** the belt crosses the top once, and the collector eats from the surface. Everything else has to fall into reach.

### What the bots say so far

From `scripts/balance-report.md`:

- **Top only:** planning matters most. The one-move-ahead bot wins every level, but random tapping wins only 0–23% of levels 3–10, except Landslide at 90%.
- **Line of fire and Exposed:** random tapping wins 67–100% of most levels as tuned. Only Mushroom (line 33%) and Rainbow (line 0%, exposed 20%) need thought.

Human playtesting should confirm or overturn this. If Line or Exposed feels better to play, tighten them with fewer slots or a smaller belt in `src/config.ts`, then re-run the balance report.

## Scoring

- **Efficiency is the score**, time is the tiebreak. Efficiency = grains in the picture ÷ total capacity of every collector you sent.
  - First trips carry exactly the picture's grains, so only re-sends lower it, each by whatever that collector still had left.
  - A near-miss re-send (3 grains left) barely costs anything; a badly timed one (240 left) costs a lot.
  - 100% means nothing was ever re-sent. Waiting doesn't help, because sand only moves when something eats it.
- **During play** the bar under the board shows live efficiency. It starts at 100% and only drops, turning red once it falls below par.
- **Par** is the best efficiency either bot (greedy or planner) reaches on that level under that rule. It's precomputed in `src/par.json` and is the same for everyone, so it's fair to share.
- **Stars:** ★★★ at or above par, ★★ within 10 points of par, ★ for any win. **Perfect** = 100%.
- **Personal bests** are kept per level and rule on the device. The results card compares efficiency and time against your best (with re-sends and grains wasted underneath) and charts efficiency over your last 10 clears against par. The levels menu shows your best stars.
- **Your moves:** the results card lists every move in order, as a filled dot for a first send or a ring for a re-send. A ring's size grows with the capacity it brought back, so costly re-sends stand out. Each dot's tooltip shows when it was made.
- **Share** uses the phone's share sheet, or copies to the clipboard. The text includes stars, efficiency vs. par, re-sends, time, the moves as emoji (squares for sends, circles for re-sends) and a link to the same level.

**Timing matters, not just order.** Sand keeps falling and collectors on the belt keep eating, so the same move a moment later meets a different board. Each move is recorded with its tick, and because the simulation is deterministic, `Game.replay(moves)` reproduces a game exactly. The tests check both. This is the groundwork for replays, ghost runs and verifiable shared scores.

## Sound and effects

- **Sounds**, all synthesized in `src/audio.ts` with Web Audio, so there are no files:
  - a send, a sand trickle while eating, and a chime when a collector empties (it rises in pitch on a streak)
  - a thud when one parks, and a buzz when a tap is refused
  - win and lose jingles, and a ding per star
- **Mute button** (🔊) in the top bar. Muting also turns off vibration (Android only).
- **Visual effects:**
  - collectors pulse as they eat and pop in a burst of sparks when they empty
  - confetti on a win
  - stars pop in one by one on the results card
- **Reduced motion:** the confetti, bursts and animations are skipped when the device's "reduce motion" setting is on.

## Playtest procedure

1. Have each tester type a name in **☰ → Tester name**.
2. Have them play levels 1–6 under one rule, then switch rules. Rotate which rule each tester starts with.
3. Don't explain the game. Watch the first 10 seconds: level 1 pulses the first collector instead of showing a text tutorial.
4. After each level the game asks **"How did you play that level?"**: planned ahead, a bit of both, or just tapped. That answer is the main data point.
5. Watch for players pausing before taps (planning) versus tapping as fast as they can (hoping).
6. Collect the logs: **☰ → Copy log** gives a CSV. Over LAN http the clipboard API is blocked, so copy from the text box instead.

The CSV records result, time, moves, re-sends, efficiency, par efficiency, stars, average seconds between moves, peak slots used, and the player's answer.

**Go/no-go:** players should say "planned ahead" or "a bit of both" on most levels after level 3, under at least one rule, and want to keep playing. If every rule feels like tap-and-hope, try the static-grid fallback before building Phase 2.

## Code map

| File | Role |
|---|---|
| `src/sand.ts` | Falling-sand grid: gravity, diagonal sliding, stone, a seeded RNG for determinism |
| `src/rules.ts` | The three reach rules, belt track, ray casting |
| `src/levels.ts` | Level art (ASCII, `.` = empty, `#` = stone) and colors |
| `src/level.ts` | Builds a grid from art and deals out collectors whose capacities exactly match grain counts |
| `src/game.ts` | Game state: belt, slots, lanes, win/lose. No DOM, so it's testable |
| `src/bots.ts` | Greedy, planner and random bots used by tests, par and the balance report |
| `src/score.ts`, `src/par.ts`, `src/compute-par.ts` | Efficiency, stars and par (compute-par runs the bots, so it stays out of the browser bundle) |
| `src/records.ts` | Personal bests per level and rule |
| `src/share.ts` | Share text and emoji moves summary |
| `src/history-chart.ts` | Recent-clears chart on the results card |
| `src/audio.ts` | Synthesized sound effects |
| `src/render.ts` | Canvas rendering: sand at 1 px per grain scaled up, belt, collectors, particles, bursts, confetti |
| `src/main.ts` | DOM UI, fixed 60 Hz game loop, menus |
| `src/playtest.ts` | Local playtest log and CSV export |
| `src/config.ts` | Tuning knobs: belt speed, belt capacity, slots, bite size |

**Notes:**
- **No PixiJS:** the earlier plan said PixiJS, but the whole board is one small pixel buffer, so plain Canvas 2D does the job. That keeps the build at about 16 KB gzipped, sound included. Revisit PixiJS if Phase 2 adds heavy effects.
- **Determinism:** game logic runs at a fixed 60 ticks a second, independent of frame rate. With the seeded sand RNG, the same taps give the same result on any device, which the Daily Mural needs.

## Next (Phase 2, if the prototype is fun)

- Level generator from PNGs, with a real solver instead of the greedy bot
- 60 levels
- Daily Mural, reusing the share text
- Replays and ghost runs from the recorded moves
- Rewarded-ad hooks
