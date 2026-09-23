# UNDEAD ONSLAUGHT

A top-down zombie survival shooter, browser-based, rendered in real 3D. Pick
a survivor and a battleground, fight escalating waves, earn scrap to upgrade
weapons between waves, and pick auto-triggering abilities as you level up
mid-fight. There's no win condition — only how long you survive.

No build step. Plain HTML/CSS/JS (ES modules), same as the rest of this
repo — the only third-party code is [Three.js](https://threejs.org/),
vendored directly into `js/vendor/` (not fetched from a CDN, so the game
works fully offline and isn't at the mercy of a CDN being reachable).

## Running it

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
cd undead-onslaught
python3 -m http.server 8081
# then open http://localhost:8081
```

## Controls

| Key            | Action                              |
| -------------- | ------------------------------------ |
| WASD / Arrows  | Move                                |
| Mouse          | Aim & Shoot                         |
| Space          | Dash                                |
| E              | Melee shove                         |
| 1–9, 0         | Switch to weapon slot (first 10)    |
| Mouse Wheel    | Cycle through every unlocked weapon |
| F              | Toggle auto-fire                    |
| Esc            | Pause                               |

## What's implemented

- **Real 3D rendering** (`js/render3d.js`) — the world is an actual
  Three.js scene, not a flat canvas: low-poly primitive shapes for the
  player/zombies (in the same spirit as the game's earlier flat-vector-shape
  look, just extruded into 3D — there's no modeling/animation pipeline
  here, so nothing is a sculpted or rigged character model), a fixed angled
  camera so the whole arena stays in view the way it always has, real
  directional + ambient + hemisphere lighting, cast shadows, and distance
  fog. Every other module (`player.js`, `enemies.js`, `weapons.js`,
  `abilities.js`, `waves.js`, ...) is still pure 2D-coordinate simulation
  state that knows nothing about rendering — `render3d.js` is the only file
  that touches Three.js, and it just maps that simulation's `x`/`y` onto a
  3D ground plane (world X = game x, world Z = game y) each frame. Mouse
  aim works by raycasting the cursor against that ground plane, since the
  camera is angled rather than a flat 1:1 projection.
- **Loadout select** — before each run, pick one of **4 survivors** and one
  of **4 battlegrounds** on a dedicated loadout screen. "Try Again" after
  death reuses your last loadout instead of sending you back through it.
- **4 playable characters**, each a real stat trade-off, not a reskin:
  - **The Rookie** — balanced, +5% XP gain. The default, no-surprises pick.
  - **The Brawler** — +25 Max HP, +50% melee damage, +10% faster dash
    cooldown, -8% move speed. Built to trade hits, not run from them.
  - **The Scout** — +18% move speed, -18% dash cooldown, -15 Max HP. Fast
    and fragile.
  - **The Technician** — +30% ability damage, +18% faster ability
    cooldowns, -12% weapon damage. Leans on auto-abilities over guns.
  Each has its own body-color scheme carried through every render of the
  player (idle glow, dash trail, gradient fill).
- **4 battlegrounds**, each with a distinct painted ground texture *and* a
  real gameplay modifier (not just a palette swap):
  - **Wasteland Compound** — the baseline. No modifiers.
  - **Suburbia Ruins** — +10% currency gain.
  - **The Boneyard** — permanent fog-of-war vignette from wave 1 (instead
    of only kicking in at wave 16+), +15% XP gain to compensate.
  - **The Foundry** — +15% currency gain, but three fixed steam-vent
    hazards periodically pulse AOE damage (telegraphed by a brightening
    warning ring) if you're standing on one when it erupts.
- **Core loop** — waves spawn from the arena edges and converge on the
  player; clearing a wave opens a between-wave shop, then the next (larger,
  faster, tougher) wave begins. Health regenerates slowly; a dash gives a
  short burst of invulnerability to escape being surrounded.
- **13 weapons, all infinite ammo** — no magazines, no reloading; firing
  is gated only by each weapon's fire-rate cooldown. All but the Pistol
  are locked until bought in the shop. Hold the mouse to fire, or press
  **F** to toggle Auto-Fire and keep the trigger held automatically
  whenever zombies are on the field.
  - **Pistol** — infinite starting sidearm.
  - **Shotgun**, **SMG**, **Assault Rifle**, **Sniper Rifle**, **Minigun**
    (spins up tighter accuracy the longer you hold the trigger) — the
    core projectile lineup.
  - **Flamethrower** — cone tick damage that also ignites zombies for
    ~2s of lingering burn damage after you stop firing. The only weapon
    with an Extended Range upgrade.
  - **Grenade Launcher** — arcing lobbed AOE.
  - **Railgun** — an instant hitscan beam that pierces every zombie
    standing in its line, each rolling its own crit independently.
  - **Crossbow** — innately pierces 2 extra targets before the Piercing
    upgrade even applies.
  - **Laser Rifle** — instant hitscan like the Railgun, but single-target
    only (no pierce) with a much faster fire rate.
  - **Rocket Launcher** — every shot is explosive, always, on top of
    whatever the Explosive Rounds upgrade adds.
  - **Chainsaw** — continuous narrow-arc melee damage at point-blank
    range instead of firing a projectile.
- **Weapon upgrade tracks** — per-weapon Damage, Fire Rate, Crit Chance,
  Piercing, and Explosive Rounds, each with independent levels and scaling
  cost (tracks that don't apply to a given weapon's firing mode — e.g.
  Piercing on the Flamethrower or the Laser Rifle — are hidden). The
  Flamethrower alone also gets **Extended Range**, pushing its cone
  further out per level.
- **16 auto-triggering abilities** — offered on level-up alongside passive
  stat cards; each levels 1–5 with scaling effects. Ability slots start at
  4, expandable to 6 via a level-up card, so you're always choosing 4-6
  out of the full roster below. The first ability is guaranteed by wave 3
  even without a natural level-up.
  - **Orbiting Blades**, **Homing Shards**, **Static Field** (damage
    aura), **Landmine Drop**, **Chain Lightning**, **Shockwave Stomp** —
    the original six.
  - **Guardian Drone** — a companion that orbits you and auto-zaps
    anything that wanders into range.
  - **Frost Trail** — leaves a chilling, damaging trail behind you as you
    move; anything standing in it gets slowed.
  - **Magnet Pulse** — periodically pulls every scrap/health drop on the
    field straight to you.
  - **Swarm Bots** — launches small seeker bots that home in and
    self-detonate for AOE damage on contact.
  - **Boomerang Blade** — thrown in whatever direction you're currently
    aiming; flies out, hits everything in its path, then arcs back
    through again on the way home.
  - **Throwing Knives** — a volley of piercing knives toward the nearest
    zombie.
  - **Fire Volcano** — erupts a lingering burning patch near a random
    nearby zombie.
  - **Holy Nova** — a big periodic burst around you that damages enemies
    *and* heals you a little each pulse.
  - **Ricochet Round** — a projectile with real travel time that bounces
    between multiple nearby zombies (as opposed to Chain Lightning's
    instant all-at-once zap).
  - **Guardian Shield** — periodically grants a shield pool that absorbs
    incoming damage before it touches your HP.
- **Between-wave shop** — spend this run's scrap on weapon unlocks/upgrades
  or permanent-for-the-run player perks (max HP, move speed, dash cooldown,
  currency gain, regen). A one-time **Auto-Aim Module** (⚙500) makes
  weapons and melee always track the nearest zombie instead of the mouse
  cursor.
- **6 zombie types** — Walker, Runner, Brute (high HP/damage, CC-resistant),
  Spitter (kites and lobs ranged acid), Screamer (buffs nearby zombies and
  periodically summons more, itself CC-resistant), and a scaling Boss every
  5th wave with telegraphed charge/slam attacks.
- **Economy & scoring** — scrap and occasional health pickups drop from
  kills (pulled in by a pickup radius stat), wave-clear and no-damage
  bonuses, instant XP on kill. Runs are saved to a local high-score list
  (rounds survived, kills, time alive) via `localStorage` — no backend.
- **Feel** — hit flashes, floating damage numbers, impact sparks on every
  bullet/beam hit (bigger and brighter on crits), knockback, a gib burst +
  shockwave ring on every kill, a muzzle flash on every shot, screen shake
  scaled to damage taken and explosions, real depth fog that closes in from
  wave 16 on (or from wave 1 on the Boneyard), dynamic shadows cast by the
  sun light and a soft light that follows the player, and brief
  invulnerability after taking a hit so one bad surround doesn't insta-kill
  you.
- **Battleground atmosphere** — each map's ambient particles are re-skinned
  to match it: drifting embers over the Foundry, slow fog wisps over the
  Boneyard, tumbling leaves over Suburbia Ruins, plain dust over the
  Wasteland Compound.
- **Punchier UI** — screens and level-up cards pop in instead of snapping
  into place, the wave banner does a scale-punch entrance every wave (with
  a bigger, pulsing red treatment on boss waves), and maxed-out ability
  icons in the HUD get a steady glow.

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
- "Headshots" are represented as a flat per-weapon crit chance rather than
  literal hit-zone collision.
- No modeled or animated characters — everyone and everything is a
  low-poly primitive shape (spheres, capsules, icosahedra, ...), by design,
  so many on-screen zombies stay readable and cheap to render at once.
- **Maps are the same arena, re-dressed.** All four battlegrounds are the
  same rectangular canvas with a different painted ground texture,
  currency/XP modifier, and (Foundry only) a few hazard zones — not
  separate layouts, geometry, or spawn patterns. Foundry's steam vents are
  visual + a damage trigger; they don't block movement or line of sight.
- Character passives are the only difference between survivors — everyone
  still starts with the same Pistol and faces the same shop.

## Project layout

```
index.html / styles.css     shell + HUD/menu DOM
js/main.js                  game loop, input → world → render orchestration
js/render3d.js              the entire Three.js presentation layer
js/vendor/                  vendored Three.js build (no CDN dependency)
js/constants.js             tunable balance numbers
js/characters.js             the 4 playable characters + stat mods
js/maps.js                   the 4 battlegrounds + modifiers/hazards
js/player.js                player state, movement, dash, XP/leveling
js/weapons.js                weapon defs + upgrade-track math
js/enemies.js                zombie type defs, spawning, AI
js/projectiles.js            bullet/grenade pool
js/abilities.js              the 16 auto-triggering abilities
js/levelup.js                level-up card generation/selection
js/waves.js                  wave scaling, spawn queue, boss waves
js/shop.js                   between-wave shop purchases
js/pickups.js                scrap/health drops
js/state.js                  localStorage high scores
js/input.js                  keyboard/mouse polling
js/utils.js                  math/RNG helpers
js/ui.js                     DOM overlay rendering (HUD, menus, shop, cards)
```
