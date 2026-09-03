# GROUND UP — A Life & Economy Simulator

A single-player, browser-based life/economy simulator. Wake up under a bridge
with a backpack, a dying phone, and $8 in change. Manage your Hunger, Energy,
Hygiene, and Warmth; grind gigs and day labor; train up Strength, Charisma,
Intelligence, Technical, and Endurance; land a career job and get promoted;
open a bank account, invest, and climb the housing ladder from a shelter cot
to a mansion.

No build step, no dependencies. Plain HTML/CSS/JS (ES modules).

## Running it

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Any static file server works. Progress is saved to `localStorage` — no backend.

## What's implemented

- **Core loop** — a day/time-block system (Morning/Afternoon/Evening, then
  sleep) where nearly every activity costs one of your three blocks for the
  day. Hunger, Energy, Hygiene, and Warmth decay each block and are shown as
  HUD meters; running any of them to zero applies a real but non-punishing
  penalty (reduced pay) rather than a game over, per the "no misery simulator"
  design goal.
- **The City** — a dozen starting-neighborhood locations (shelter, food bank,
  library, day labor office, recycling center, diner, laundromat, public
  square, gym, bank, bus stop) each offering context-appropriate actions.
  Buying a bus pass unlocks a downtown district with four career-job sites.
- **Gigs & careers** — five repeatable, no-application gigs (scavenging,
  day labor, busking, flea market, bike delivery) that train a relevant stat
  and pay scaled by your level in it, plus four career tracks (retail,
  office, repair, warehouse) with a 3-rung promotion ladder each, gated by
  stat level, reputation, and hygiene at the interview.
- **Stats & skills** — five trainable stats (Strength, Charisma, Intelligence,
  Technical, Endurance), leveled by XP earned from the matching gigs/jobs/
  library study, gating which gigs pay well and which careers you can land.
- **Phone hub** — a Jobs board (gig listings + remote career applications),
  a Bank/Market app (account opening via a shelter-caseworker ID quest,
  deposits/withdrawals, reputation-gated loans, four fictional stocks with a
  daily random walk you can buy/sell), a Map (district/location reference),
  and a Messages log (event history + recurring "Old Ray" mentor tips). The
  phone has a battery that drains with use and must be recharged for free at
  the library — dead phone, no phone apps.
- **Housing ladder** — ten tiers from the street through a shelter bed,
  weekly motel, rented room, studio, one-bedroom, up through four
  outright-purchase tiers (starter house → mansion), each gated by net worth
  and/or reputation, each with its own sleep-quality (needs restore) profile.
  Renting requires deposit + first payment; missing rent on a later night
  evicts you down a tier. Owned homes count toward net worth as an asset.
  Sleeping is the day-rollover action: it resolves rent/loan due dates, bank
  interest, stock price movement, and a random morning event.
- **Reputation** — a single -100..100 score, raised by working shifts and
  donating back to the shelter, that gates career hiring, apartment rentals,
  and bank loans.
- **Random events** — on ~45% of mornings: cold snaps, being moved along by
  police if sleeping rough, a scam attempt an Intelligence check can see
  through, lucky item finds, small windfalls, unexpected bills, and mentor
  flavor text from Old Ray.
- **Shop** — seven durable goods (coat, boots, bike, business casual outfit,
  tool belt, phone charger pack, reading glasses) with concrete numeric
  bonuses to relevant pay, stat gain, or need decay.
- **Status ladder & achievements** — net worth drives a seven-tier status
  label (Homeless → Getting By → Working Class → Comfortable → Established →
  Wealthy → Self-Made Elite) shown in the HUD, plus 17 achievements tracked
  on a dedicated Progress screen.

## Project layout

```
index.html / styles.css      shell + warm, grounded theme
js/data.js                   locations, gigs, careers, housing tiers, shop
                              catalog, stocks, status tiers, achievements
js/state.js                  save/load, day/time loop, needs, economy,
                              stats/XP, reputation, housing, events
js/ui.js                     screen routing, HUD, toasts, modals
js/screens/city.js            location action panels
js/screens/phone.js          Jobs / Bank & Market / Map / Messages tabs
js/screens/character.js      stats, needs, job, inventory sheet
js/screens/housing.js         housing ladder + Sleep Tonight (day rollover)
js/screens/shop.js            durable goods shop
js/screens/progress.js       status ladder + achievements
js/main.js                   nav wiring, intro, init
```

## Known simplifications

This is a from-scratch build of a very large spec (full 3D open world,
character customization, deep dialogue/romance system, a full business-
ownership/hiring sim, realistic mortgage amortization, weather/seasons,
day/night visuals), scoped to a solid playable core rather than every
feature listed in the original design doc. Not implemented: 3D or 2D
character rendering (this is a UI-driven sim, no avatar), travel time/cost
between locations (all unlocked locations are reachable within a block),
starting your own business, romance/relationship threads beyond the Old Ray
mentor flavor, interactive event choice dialogs (the one Intelligence-gated
scam event auto-resolves off your stat rather than presenting a choice), and
a full credit-score system (loans are a flat reputation-gated offer rather
than a modeled credit score).
