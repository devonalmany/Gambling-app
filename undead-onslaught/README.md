# UNDEAD ONSLAUGHT

A top-down 2D zombie survival shooter, browser-based. Fight escalating
waves, earn scrap to upgrade weapons between waves, and pick auto-triggering
abilities as you level up mid-fight. There's no win condition — only how
long you survive.

No build step, no dependencies. Plain HTML/CSS/JS (ES modules), same as the
rest of this repo.

## Running it

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
cd undead-onslaught
python3 -m http.server 8081
# then open http://localhost:8081
```

## Controls

| Key            | Action              |
| -------------- | ------------------- |
| WASD / Arrows  | Move                |
| Mouse          | Aim & Shoot         |
| R              | Reload              |
| Space          | Dash                |
| E              | Melee shove         |
| 1–8            | Switch weapon       |
| Esc            | Pause               |

## What's implemented

- **Core loop** — waves spawn from the arena edges and converge on the
  player; clearing a wave opens a between-wave shop, then the next (larger,
  faster, tougher) wave begins. Health regenerates slowly; a dash gives a
  short burst of invulnerability to escape being surrounded.
- **8 weapons** — Pistol (infinite ammo, starting weapon), Shotgun, SMG,
  Assault Rifle, Sniper Rifle, Flamethrower (continuous cone tick damage),
  Grenade Launcher (arcing AOE), and Minigun (spins up tighter accuracy the
  longer you hold the trigger). All but the Pistol are locked until bought
  in the shop.
- **Weapon upgrade tracks** — per-weapon Damage, Fire Rate, Reload Speed,
  Magazine Size, Crit Chance, Piercing, and Explosive Rounds, each with
  independent levels and scaling cost.
- **6 auto-triggering abilities** — Orbiting Blades, Homing Shards, Static
  Field (damage aura), Landmine Drop, Chain Lightning, and Shockwave Stomp.
  Offered on level-up alongside passive stat cards; each levels 1–5 with
  scaling effects. Ability slots start at 4, expandable to 6 via a level-up
  card. The first ability is guaranteed by wave 3 even without a natural
  level-up.
- **Between-wave shop** — spend this run's scrap on weapon unlocks/upgrades
  or permanent-for-the-run player perks (max HP, move speed, dash cooldown,
  currency gain, regen, ammo refill rate). A one-time **Auto-Aim Module**
  (⚙500) makes weapons and melee always track the nearest zombie instead of
  the mouse cursor.
- **6 zombie types** — Walker, Runner, Brute (high HP/damage, CC-resistant),
  Spitter (kites and lobs ranged acid), Screamer (buffs nearby zombies and
  periodically summons more, itself CC-resistant), and a scaling Boss every
  5th wave with telegraphed charge/slam attacks.
- **Economy & scoring** — scrap and occasional health pickups drop from
  kills (pulled in by a pickup radius stat), wave-clear and no-damage
  bonuses, instant XP on kill. Runs are saved to a local high-score list
  (rounds survived, kills, time alive) via `localStorage` — no backend.
- **Feel** — hit flashes, floating damage numbers, knockback, crit callouts,
  a fog vignette that closes in from wave 16 on, and brief invulnerability
  after taking a hit so one bad surround doesn't insta-kill you.

## Known simplifications

This is a from-scratch build of a very large spec, scoped to a solid
playable core rather than every feature listed in the original design doc.
Not yet implemented:

- **Cross-run meta-progression.** The shop's currency and upgrades are
  scoped to the current run only; there's no persistent meta-currency
  "armory" that carries permanent unlocks between runs. High scores do
  persist locally.
- **Ability evolutions/fusions** (e.g. a maxed ability + a high-level
  weapon merging into a stronger fused effect) — abilities level 1–5 on
  their own but don't cross-evolve.
- Four abilities from the original list aren't implemented: Guardian
  Drone, Frost Trail, Magnet Pulse, and Swarm Bots. The six that are
  implemented cover the same design space (single-target homing, AOE aura,
  proximity melee, trap, chain, and knockback-burst).
- "Headshots" are represented as a flat per-weapon crit chance rather than
  literal hit-zone collision.
- No sprite art — flat vector shapes (circles/simple polygons), by design,
  so many on-screen zombies stay readable at once.

## Project layout

```
index.html / styles.css     shell + HUD/menu DOM
js/main.js                  game loop, input → world → render orchestration
js/constants.js             tunable balance numbers
js/player.js                player state, movement, dash, XP/leveling
js/weapons.js                weapon defs + upgrade-track math
js/enemies.js                zombie type defs, spawning, AI
js/projectiles.js            bullet/grenade pool
js/abilities.js              the 6 auto-triggering abilities
js/levelup.js                level-up card generation/selection
js/waves.js                  wave scaling, spawn queue, boss waves
js/shop.js                   between-wave shop purchases
js/pickups.js                scrap/health drops
js/state.js                  localStorage high scores
js/input.js                  keyboard/mouse polling
js/utils.js                  math/RNG helpers
js/ui.js                     DOM overlay rendering (HUD, menus, shop, cards)
```
