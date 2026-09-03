# HIGH ROLLER — Rags to Riches Casino Simulator

A single-player, browser-based casino simulator. Start homeless with $5, grind
up through Texas Hold'em, Blackjack, Roulette, and Slot Machines against AI
opponents, and climb from **Homeless** to **Casino Owner** — spending your
winnings on cosmetics and housing along the way.

No build step, no dependencies. Plain HTML/CSS/JS (ES modules).

## Running it

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Any static file server works. Progress is saved to `localStorage` — no backend.

## What's implemented

- **Core loop & progression** — net worth drives a six-tier status ladder
  (Homeless → Grinder → Regular → High Roller → Whale → Casino Owner) that
  gates tables, machines, shop items, and homes. HUD shows cash, status, and
  progress to the next tier.
- **Texas Hold'em** — heads-up No-Limit vs. one AI opponent per stakes room,
  full betting engine (bet/raise/call/fold/all-in with short-all-in pot
  reconciliation), a real 7-card hand evaluator, and a Monte Carlo equity
  estimator driving the AI's postflop decisions. Each room's opponent has a
  distinct personality (tightness/aggression/bluff frequency) plus an
  occasional visible "tell" when bluffing; the Nosebleed room's "Shark"
  adapts its aggression to your fold/raise tendencies during the session.
- **Blackjack** — shoe-based dealing, hit/stand/double/split (one level)/
  surrender (higher tables), dealer stands on 17, blackjack pays 3:2.
- **Roulette** — American double-zero wheel, straight-up + all standard
  outside bets (red/black, odd/even, high/low, dozens, columns), spin
  animation. (Split/street/corner/line combo bets are a stretch-goal, not
  implemented.)
- **Slot Machines** — five themed machines (fruit/Egyptian/pirate/cyberpunk/
  mythology) with distinct variance profiles, 5 paylines, wilds, scatters,
  a pick-a-box bonus round, and a shared progressive jackpot that grows with
  every spin across every machine.
- **Style Shop** — outfits, jewelry, hair/face, and emotes, gated by status
  tier and paid in cash or Style Points (earned from wins). Some items grant
  small flavor bonuses (tell resistance / confidence) reflected in the
  poker AI's tell-reveal odds. A small "Crew" of recruitable teammates adds
  flavor bonuses (e.g. a post-hand tip from the Poker Shark).
- **Home Shop** — nine tiers from a park bench to your own casino, each with
  a daily login bonus and, at higher tiers, a boosted-payout perk.
- **Bankruptcy & meta-progression** — dropping below the table minimum
  anywhere ends the run: a summary screen, then reset to homeless/$5 (+ a
  permanent "Comeback Bonus" after your first bankruptcy). Achievements,
  Hall of Fame history, and lifetime cosmetic unlocks persist across runs.
- **Responsible design** — a persistent "this is not real money" banner, a
  pause menu with an explicit "Take a Break" option, a periodic session-length
  nudge, and honest RNG (no artificially inflated near-misses on slots).

## Project layout

```
index.html / styles.css      shell + Vegas-noir theme
js/data.js                   status tiers, shop catalogs, room/table defs
js/state.js                  save/load, cash & progression, bankruptcy
js/cards.js                  deck, shuffle, blackjack math, poker hand eval
js/ui.js                     screen routing, HUD, toasts, modals
js/shops.js                  Style Shop + Home Shop
js/games/blackjack.js
js/games/roulette.js
js/games/slots.js
js/games/poker.js
js/main.js                   casino floor, nav, achievements, pause menu
```

## Known simplifications

This is a from-scratch build of a very large spec, scoped to a solid playable
core rather than every feature listed in the original design doc. Not yet
implemented: 3D/animated character viewer, roulette combo bets (split/street/
corner/line), multi-way (3+ player) poker tables, free-spin sessions on slots
(collapsed into the pick-a-box bonus instead), and cloud save.
