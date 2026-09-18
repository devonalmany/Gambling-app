import { PLAYER, WAVE, ARENA_MARGIN } from "./constants.js";
import { Input } from "./input.js";
import * as UI from "./ui.js";
import { loadHighScores, saveRun } from "./state.js";
import {
  createPlayer,
  updatePlayer,
  tryDash,
  damagePlayer,
  healPlayer,
  grantXp,
  grantCurrency,
  pickupRadius,
} from "./player.js";
import { WEAPON_ORDER, WEAPON_DEFS, effectiveStats } from "./weapons.js";
import { spawnProjectile, updateProjectiles } from "./projectiles.js";
import { updateEnemies, applyKnockback, spawnZombie } from "./enemies.js";
import { spawnCurrencyDrop, maybeSpawnHealthDrop, updatePickups } from "./pickups.js";
import { updateAbilities } from "./abilities.js";
import { generateLevelUpCards, applyCard } from "./levelup.js";
import {
  refillAmmoForWave,
  buyPerk,
  buyWeaponUnlock,
  buyWeaponUpgrade,
} from "./shop.js";
import { createWaveManager, startWave, updateWaveManager, isWaveClear } from "./waves.js";
import { dist, angleTo, clamp, randRange, randInt } from "./utils.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let bounds = { w: window.innerWidth, h: window.innerHeight };
let groundTexture = null;
let ambientParticles = [];
let shakeTimeLeft = 0;
let shakeMag = 0;

function addShake(mag, dur) {
  shakeMag = Math.max(shakeMag, mag);
  shakeTimeLeft = Math.max(shakeTimeLeft, dur);
}
function updateShake(dt) {
  if (shakeTimeLeft > 0) {
    shakeTimeLeft -= dt;
  } else {
    shakeMag = 0;
  }
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  bounds = { w: window.innerWidth, h: window.innerHeight };
  canvas.width = Math.round(bounds.w * dpr);
  canvas.height = Math.round(bounds.h * dpr);
  canvas.style.width = `${bounds.w}px`;
  canvas.style.height = `${bounds.h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  groundTexture = buildGroundTexture(bounds.w, bounds.h);
}

// A painted wasteland ground, baked once per resize instead of drawn live:
// base gradient wash, patchy dirt/rot blotches, cracks, and scattered rubble.
function buildGroundTexture(w, h) {
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(w));
  off.height = Math.max(1, Math.round(h));
  const g = off.getContext("2d");

  const grad = g.createRadialGradient(w * 0.5, h * 0.42, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  grad.addColorStop(0, "#182015");
  grad.addColorStop(0.55, "#121a10");
  grad.addColorStop(1, "#0a0f08");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // mottled dirt/rot patches
  const patchCount = Math.round((w * h) / 26000);
  for (let i = 0; i < patchCount; i++) {
    const x = randRange(0, w);
    const y = randRange(0, h);
    const r = randRange(30, 110);
    const tone = choiceWeighted();
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, tone);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = randRange(0.12, 0.28);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // cracks
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 1.4;
  const crackCount = Math.round((w * h) / 90000);
  for (let i = 0; i < crackCount; i++) {
    let x = randRange(0, w);
    let y = randRange(0, h);
    g.beginPath();
    g.moveTo(x, y);
    const segs = randInt(3, 6);
    let ang = randRange(0, Math.PI * 2);
    for (let s = 0; s < segs; s++) {
      ang += randRange(-0.6, 0.6);
      x += Math.cos(ang) * randRange(14, 34);
      y += Math.sin(ang) * randRange(14, 34);
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // rubble / debris flecks
  for (let i = 0; i < patchCount * 1.5; i++) {
    const x = randRange(0, w);
    const y = randRange(0, h);
    const s = randRange(1.5, 4.5);
    g.fillStyle = `rgba(0,0,0,${randRange(0.2, 0.4)})`;
    g.fillRect(x, y, s, s * randRange(0.5, 1));
  }

  // faint grid, much subtler than before — reads as broken pavement seams
  g.strokeStyle = "rgba(255,255,255,0.025)";
  g.lineWidth = 1;
  const grid = 64;
  for (let x = 0; x < w; x += grid) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  for (let y = 0; y < h; y += grid) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }

  // vignette baked into the texture itself
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  return off;
}

function choiceWeighted() {
  const tones = ["#2c3a22", "#241c16", "#1a2418", "#33291a"];
  return tones[Math.floor(Math.random() * tones.length)];
}

window.addEventListener("resize", resize);
resize();
Input.init(canvas);
initAmbientParticles();

// ---- Ambient dust motes ----------------------------------------------------
function initAmbientParticles() {
  ambientParticles = Array.from({ length: 26 }, () => ({
    x: randRange(0, bounds.w),
    y: randRange(0, bounds.h),
    vx: randRange(-6, 6),
    vy: randRange(-10, -3),
    r: randRange(0.8, 2.2),
    a: randRange(0.05, 0.16),
  }));
}
function updateAmbientParticles(dt) {
  for (const p of ambientParticles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < -10) {
      p.y = bounds.h + 10;
      p.x = randRange(0, bounds.w);
    }
    if (p.x < -10) p.x = bounds.w + 10;
    if (p.x > bounds.w + 10) p.x = -10;
  }
}

// ---- Game state ----------------------------------------------------------
let player = null;
let enemies = [];
let friendlyProjectiles = [];
let enemyProjectiles = [];
let pickups = [];
let popups = []; // floating damage / pickup text
let waveManager = createWaveManager();
let screen = "start"; // start | playing | paused | levelup | waveclear | shop | gameover
let elapsed = 0;
let bannerTimer = 0;
let waveClearTimer = 0;
let pendingLevelUps = 0;
let forceAbilityCardQueued = false;
let lastCardsAbilitiesOnly = false;
let lastTs = 0;

UI.renderStartHighScores(loadHighScores());

document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("restartBtn").addEventListener("click", startGame);
document.getElementById("shopNextWaveBtn").addEventListener("click", startNextWave);
document.getElementById("resumeBtn").addEventListener("click", () => setScreen("playing"));
document.getElementById("pauseRestartBtn").addEventListener("click", startGame);

function startGame() {
  player = createPlayer(bounds.w, bounds.h);
  enemies = [];
  friendlyProjectiles = [];
  enemyProjectiles = [];
  pickups = [];
  popups = [];
  waveManager = createWaveManager();
  elapsed = 0;
  pendingLevelUps = 0;
  forceAbilityCardQueued = false;
  UI.setHudVisible(true);
  setScreen("playing");
  beginWave(1);
  lastTs = performance.now();
}

function beginWave(wave) {
  player.damageTakenThisWave = false;
  startWave(waveManager, wave, enemies, bounds);
  UI.renderWaveBanner(wave, false, 0);
  bannerTimer = 1.6;
  if (wave === 3 && player.abilities.length === 0) {
    forceAbilityCardQueued = true;
  }
}

function startNextWave() {
  refillAmmoForWave(player);
  setScreen("playing");
  beginWave(waveManager.wave + 1);
}

function setScreen(next) {
  screen = next;
  if (next === "playing") {
    UI.showScreen(null);
    UI.setHudVisible(true);
  } else if (next === "start") {
    UI.showScreen("startScreen");
    UI.setHudVisible(false);
  } else if (next === "paused") {
    UI.showScreen("pauseScreen");
    UI.setHudVisible(true);
  } else if (next === "waveclear") {
    // the wave-clear banner is its own overlay, not a ".screen"
    UI.showScreen(null);
    UI.setHudVisible(true);
  } else {
    // levelup / shop / gameover render their own screen and manage the HUD
    UI.setHudVisible(next !== "gameover");
  }
}

// ---- Weapon firing ---------------------------------------------------------
function currentWeaponRuntime() {
  return player.weapons[player.currentWeapon];
}

function switchWeapon(id) {
  if (!player.weapons[id] || !player.weapons[id].unlocked) return;
  player.currentWeapon = id;
}

function startReload(w, def) {
  if (def.infiniteAmmo || w.reloading) return;
  if (w.ammoInMag >= def.magSize || w.ammoReserve <= 0) return;
  w.reloading = true;
  const stats = effectiveStats(def, w.upgrades);
  w.reloadTimer = stats.reloadTime;
}

function finishReload(w, def) {
  const stats = effectiveStats(def, w.upgrades);
  const need = stats.magSize - w.ammoInMag;
  const take = Math.min(need, w.ammoReserve);
  w.ammoInMag += take;
  w.ammoReserve -= take;
  w.reloading = false;
}

function fireBullet(player, def, stats, angle, dmg) {
  const half = (stats.spreadDeg ?? def.spreadDeg ?? 0) * (Math.PI / 180) / 2;
  const a = angle + randRange(-half, half);
  const crit = Math.random() < stats.critChance;
  spawnProjectile(friendlyProjectiles, {
    x: player.x,
    y: player.y,
    angle: a,
    speed: def.bulletSpeed,
    damage: crit ? dmg * 2 : dmg,
    crit,
    pierce: stats.pierce,
    explosive: stats.explosive,
    explosionRadius: stats.explosionRadius,
    explosionDamageMul: stats.explosionDamageMul,
    radius: 4,
    color: crit ? "#ff5c5c" : "#ffe066",
  });
}

function updateWeapon(dt, now) {
  const def = WEAPON_DEFS[player.currentWeapon];
  const w = currentWeaponRuntime();
  const stats = effectiveStats(def, w.upgrades);

  if (w.reloading) {
    w.reloadTimer -= dt;
    if (w.reloadTimer <= 0) finishReload(w, def);
  }
  if (w.fireTimer > 0) w.fireTimer -= dt;

  if (Input.wasPressed("KeyR")) startReload(w, def);

  const aim = computeAimAngle();
  const firing = isFiring();

  if (def.mode === "cone") {
    if (firing && !w.reloading && w.ammoInMag > 0 && w.fireTimer <= 0) {
      w.fireTimer = 1 / stats.fireRate;
      w.ammoInMag -= 1;
      const half = (def.coneDeg * Math.PI) / 180 / 2;
      for (const z of enemies) {
        const a = angleTo(player.x, player.y, z.x, z.y);
        const d = dist(player.x, player.y, z.x, z.y);
        if (d <= def.range + z.radius && Math.abs(normDiff(a, aim)) <= half) {
          damageEnemy(z, stats.damage);
          igniteEnemy(z, stats.damage, now);
        }
      }
      spawnFlameCone(player.x, player.y, aim, def.range);
      spawnMuzzleFlash(aim, "#ff8c28");
      if (w.ammoInMag <= 0) startReload(w, def);
    }
    return;
  }

  if (def.mode === "lob") {
    if (firing && !w.reloading && w.ammoInMag > 0 && w.fireTimer <= 0) {
      w.fireTimer = 1 / stats.fireRate;
      w.ammoInMag -= 1;
      spawnProjectile(friendlyProjectiles, {
        x: player.x,
        y: player.y,
        angle: aim + randRange(-0.02, 0.02),
        speed: def.bulletSpeed,
        damage: stats.damage,
        pierce: 0,
        explosive: true,
        explosionRadius: Math.max(def.explosionRadius, stats.explosionRadius),
        explosionDamageMul: 1,
        radius: 6,
        mode: "grenade",
        fuse: 0.85,
        color: "#a3e635",
      });
      spawnMuzzleFlash(aim, "#a3e635");
      if (w.ammoInMag <= 0) startReload(w, def);
    }
    return;
  }

  // projectile mode (pistol/shotgun/smg/rifle/sniper/minigun)
  if (player.currentWeapon === "minigun") {
    w.holdTime = firing ? Math.min(def.spinUpTime, w.holdTime + dt) : Math.max(0, w.holdTime - dt * 2);
  }

  if (firing && !w.reloading && w.fireTimer <= 0) {
    if (def.infiniteAmmo || w.ammoInMag > 0) {
      w.fireTimer = 1 / stats.fireRate;
      if (!def.infiniteAmmo) w.ammoInMag -= 1;
      let spread = stats.spreadDeg ?? def.spreadDeg;
      if (player.currentWeapon === "minigun") {
        const t = w.holdTime / def.spinUpTime;
        spread = def.spreadDeg + (def.spreadDegSpunUp - def.spreadDeg) * t;
      }
      const pellets = def.pellets ?? 1;
      for (let i = 0; i < pellets; i++) {
        fireBullet(player, def, { ...stats, spreadDeg: spread }, aim, stats.damage);
      }
      spawnMuzzleFlash(aim, "#ffe066");
      if (!def.infiniteAmmo && w.ammoInMag <= 0) startReload(w, def);
    } else {
      startReload(w, def);
    }
  }
}

function normDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// With the Auto-Aim Module owned, weapons/melee/facing track the nearest
// zombie instead of the mouse cursor.
function computeAimAngle() {
  if (player.autoAim) {
    const target = nearestEnemyToPlayer();
    if (target) return angleTo(player.x, player.y, target.x, target.y);
  }
  return angleTo(player.x, player.y, Input.mouse.x, Input.mouse.y);
}

function nearestEnemyToPlayer() {
  let best = null;
  let bestD = Infinity;
  for (const z of enemies) {
    const d = dist(player.x, player.y, z.x, z.y);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

// Auto-Fire (toggled with F) keeps the trigger held automatically, but only
// while there's actually something on the field — no point burning ammo
// into empty air between spawns.
function isFiring() {
  return Input.mouse.down || (player.autoFire && enemies.length > 0);
}

const muzzleFlashes = [];
function spawnMuzzleFlash(angle, color) {
  const tipX = player.x + Math.cos(angle) * (player.radius + 14);
  const tipY = player.y + Math.sin(angle) * (player.radius + 14);
  muzzleFlashes.push({ x: tipX, y: tipY, angle, life: 0.06, age: 0, color });
}

const flameParticles = [];
function spawnFlameCone(x, y, angle, range) {
  const count = randInt(4, 6);
  for (let i = 0; i < count; i++) {
    const a = angle + randRange(-0.32, 0.32);
    const speed = randRange(90, 210);
    flameParticles.push({
      x: x + Math.cos(a) * 8,
      y: y + Math.sin(a) * 8,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      size: randRange(6, 13),
      life: randRange(0.22, 0.4),
      age: 0,
      smoke: false,
    });
  }
  for (let i = 0; i < 2; i++) {
    const a = angle + randRange(-0.4, 0.4);
    const d = randRange(range * 0.3, range * 0.6);
    flameParticles.push({
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      vx: Math.cos(a) * 22 + randRange(-10, 10),
      vy: Math.sin(a) * 22 - 26,
      size: randRange(10, 17),
      life: randRange(0.5, 0.8),
      age: 0,
      smoke: true,
    });
  }
}

// Flamethrower ignition: a lingering burn that keeps ticking after a
// zombie steps out of the cone, refreshed for as long as it stays lit.
function igniteEnemy(z, hitDamage, now) {
  z.burnUntil = now + 2000;
  z.burnTickDamage = Math.max(z.burnTickDamage, hitDamage * 0.3);
  if (z.burnTickTimer <= 0) z.burnTickTimer = 0.4;
}

function updateBurns(dt, now) {
  for (const z of enemies) {
    if (z.hp <= 0 || z.burnUntil <= now) continue;
    z.burnTickTimer -= dt;
    if (z.burnTickTimer <= 0) {
      z.burnTickTimer = 0.4;
      damageEnemy(z, z.burnTickDamage);
      popups.push({ x: z.x, y: z.y - 8, text: Math.round(z.burnTickDamage).toString(), life: 0.4, age: 0, color: "#ff8c28" });
    }
  }
}

// ---- Melee shove -----------------------------------------------------------
function tryMelee() {
  if (player.meleeCooldownLeft > 0) return;
  player.meleeCooldownLeft = PLAYER.meleeCooldown;
  player.meleeSwingT = 1;
  const aim = computeAimAngle();
  for (const z of enemies) {
    const d = dist(player.x, player.y, z.x, z.y);
    if (d > PLAYER.meleeRange + z.radius) continue;
    const a = angleTo(player.x, player.y, z.x, z.y);
    if (Math.abs(normDiff(a, aim)) <= PLAYER.meleeArc / 2) {
      damageEnemy(z, PLAYER.meleeDamage);
      applyKnockback(z, Math.cos(a), Math.sin(a), PLAYER.meleeKnockback);
    }
  }
}

// ---- Damage / death handling -----------------------------------------------
function damageEnemy(z, amount) {
  z.hp -= amount;
  z.hitFlashUntil = performance.now() + 90;
}

function killRewardsAndCleanup() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const z = enemies[i];
    if (z.hp > 0) continue;
    grantXpAndMaybeLevel(z.xp);
    spawnCurrencyDrop(pickups, z.x, z.y, z.currency);
    maybeSpawnHealthDrop(pickups, z.x, z.y);
    player.kills += 1;
    popups.push({ x: z.x, y: z.y, text: z.isBoss ? "BOSS DOWN" : "+" + z.xp + "xp", life: 0.8, age: 0, color: "#ffe066" });
    enemies.splice(i, 1);
  }
}

function grantXpAndMaybeLevel(amount) {
  const leveled = grantXp(player, amount);
  if (leveled.length) pendingLevelUps += leveled.length;
}

function onPlayerHit(dmg, dirX, dirY) {
  const hurt = damagePlayer(player, dmg);
  if (hurt) {
    player.x -= dirX * 6;
    player.y -= dirY * 6;
    popups.push({ x: player.x, y: player.y - 20, text: `-${Math.round(dmg)}`, life: 0.6, age: 0, color: "#ff6b6b" });
    addShake(clamp(dmg * 0.15, 1, 8), 0.12);
  }
}

// ---- Level-up presentation --------------------------------------------------
function presentLevelUpIfNeeded() {
  if (screen !== "playing") return;
  if (forceAbilityCardQueued) {
    forceAbilityCardQueued = false;
    lastCardsAbilitiesOnly = true;
    const cards = generateLevelUpCards(player, { abilitiesOnly: true });
    if (cards.length) {
      setScreen("levelup");
      UI.renderLevelUpCards(cards, onPickCard);
      return;
    }
  }
  if (pendingLevelUps > 0) {
    lastCardsAbilitiesOnly = false;
    const cards = generateLevelUpCards(player);
    if (cards.length) {
      setScreen("levelup");
      UI.renderLevelUpCards(cards, onPickCard);
    } else {
      pendingLevelUps = 0;
    }
  }
}

function onPickCard(card) {
  applyCard(player, card);
  if (!lastCardsAbilitiesOnly) pendingLevelUps = Math.max(0, pendingLevelUps - 1);
  setScreen("playing");
  presentLevelUpIfNeeded();
}

// ---- Main update ------------------------------------------------------------
function update(dt, now) {
  elapsed += dt;

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) UI.hideWaveBanner();
  }

  const moveVec = Input.moveVector();
  updatePlayer(player, dt, Input, moveVec, bounds);
  player.facing = computeAimAngle();

  for (const id of WEAPON_ORDER) {
    const def = WEAPON_DEFS[id];
    if (Input.wasPressed(def.key)) switchWeapon(id);
  }
  updateWeapon(dt, now);

  if (Input.wasPressed("Space") || Input.wasPressed("ShiftLeft")) tryDash(player, moveVec);
  if (Input.wasPressed("KeyE")) tryMelee();
  if (Input.wasPressed("KeyF")) player.autoFire = !player.autoFire;

  updateEnemies(enemies, dt, player, {
    bounds,
    enemyProjectiles,
    now,
    onPlayerHit,
    spawnExtra: (x, y) => {
      if (enemies.length < WAVE.maxAlive) spawnZombie(enemies, "walker", waveManager.wave, bounds);
    },
  });

  updateProjectiles(friendlyProjectiles, dt, bounds);
  updateProjectiles(enemyProjectiles, dt, bounds);

  // friendly projectiles vs enemies
  for (let i = friendlyProjectiles.length - 1; i >= 0; i--) {
    const p = friendlyProjectiles[i];
    let consumed = false;
    for (const z of enemies) {
      if (z.hp <= 0 || p.hitIds.has(z.uid)) continue;
      if (dist(p.x, p.y, z.x, z.y) <= p.radius + z.radius) {
        applyHit(p, z);
        p.hitIds.add(z.uid);
        if (p.explosive) explode(p);
        if (p.mode === "grenade") {
          consumed = true;
          break;
        }
        if (p.pierceLeft > 0) {
          p.pierceLeft -= 1;
        } else {
          consumed = true;
          break;
        }
      }
    }
    if (!consumed && p.mode === "grenade" && p.age >= p.fuse) {
      explode(p);
      consumed = true;
    }
    if (consumed) friendlyProjectiles.splice(i, 1);
  }

  // enemy projectiles vs player
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const p = enemyProjectiles[i];
    if (dist(p.x, p.y, player.x, player.y) <= p.radius + player.radius) {
      onPlayerHit(p.damage, p.vx / (Math.hypot(p.vx, p.vy) || 1), p.vy / (Math.hypot(p.vx, p.vy) || 1));
      enemyProjectiles.splice(i, 1);
    }
  }

  updateAbilities(player, dt, { now, enemies, damageEnemy, arenaBounds: bounds });
  updateBurns(dt, now);

  killRewardsAndCleanup();

  updatePickups(pickups, dt, player, pickupRadius(player), false, (p) => {
    if (p.kind === "currency") grantCurrency(player, p.amount);
    else healPlayer(player, p.amount);
  });

  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].age += dt;
    popups[i].y -= 26 * dt;
    if (popups[i].age >= popups[i].life) popups.splice(i, 1);
  }
  for (let i = flameParticles.length - 1; i >= 0; i--) {
    flameParticles[i].age += dt;
    if (flameParticles[i].age >= flameParticles[i].life) flameParticles.splice(i, 1);
  }
  for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
    muzzleFlashes[i].age += dt;
    if (muzzleFlashes[i].age >= muzzleFlashes[i].life) muzzleFlashes.splice(i, 1);
  }
  updateShake(dt);

  updateWaveManager(waveManager, dt, enemies, bounds);

  UI.updateHud(player, waveManager.wave, elapsed);

  presentLevelUpIfNeeded();

  if (screen === "playing" && isWaveClear(waveManager, enemies) && pendingLevelUps === 0) {
    waveManager.active = false;
    const bonus = WAVE.clearBonus + (player.damageTakenThisWave ? 0 : WAVE.noDamageBonus);
    grantCurrency(player, bonus);
    UI.renderWaveBanner(waveManager.wave, true, bonus);
    setScreen("waveclear");
    waveClearTimer = 1.6;
  }

  if (player.hp <= 0 && screen === "playing") {
    gameOver();
  }
}

function applyHit(p, z) {
  z.hp -= p.damage;
  const a = angleTo(p.x, p.y, z.x, z.y);
  applyKnockback(z, Math.cos(a), Math.sin(a), 40);
  popups.push({ x: z.x, y: z.y - 10, text: p.crit ? `${Math.round(p.damage)}!` : `${Math.round(p.damage)}`, life: 0.45, age: 0, color: p.crit ? "#ff5c5c" : "#f4f4f4" });
}

function explode(p) {
  addShake(p.mode === "grenade" ? 6 : 3, p.mode === "grenade" ? 0.22 : 0.12);
  for (const z of enemies) {
    if (z.hp <= 0) continue;
    const d = dist(p.x, p.y, z.x, z.y);
    if (d <= p.explosionRadius + z.radius) {
      const falloff = 1 - d / (p.explosionRadius + z.radius);
      damageEnemy(z, p.damage * p.explosionDamageMul * (0.5 + 0.5 * falloff) + (p.mode === "grenade" ? p.damage * 0.5 : 0));
      const a = angleTo(p.x, p.y, z.x, z.y);
      applyKnockback(z, Math.cos(a), Math.sin(a), 160);
    }
  }
}

// ---- Rendering ---------------------------------------------------------------
function render() {
  ctx.clearRect(0, 0, bounds.w, bounds.h);
  ctx.save();
  if (shakeMag > 0.05) {
    ctx.translate(randRange(-shakeMag, shakeMag), randRange(-shakeMag, shakeMag));
  }

  drawArena();
  drawAmbientParticles();

  if (!player) {
    ctx.restore();
    return;
  }

  drawPickups();
  drawAbilityVisuals();
  drawFlames();
  drawMuzzleFlashes();
  drawProjectiles(friendlyProjectiles);
  drawProjectiles(enemyProjectiles, true);
  drawEnemies();
  drawPlayer();
  drawPopups();

  if (waveManager.wave >= 16) drawFog();
  if (player.hp / player.maxHp < 0.3) drawLowHealthVignette();
  ctx.restore();
}

function drawArena() {
  if (groundTexture) {
    ctx.drawImage(groundTexture, 0, 0, bounds.w, bounds.h);
  } else {
    ctx.fillStyle = "#10170e";
    ctx.fillRect(0, 0, bounds.w, bounds.h);
  }
  drawArenaCorners();
}

function drawArenaCorners() {
  const m = ARENA_MARGIN / 2;
  const len = 34;
  ctx.strokeStyle = "rgba(234,75,79,0.55)";
  ctx.lineWidth = 3;
  ctx.lineCap = "square";
  const corners = [
    [m, m, 1, 1],
    [bounds.w - m, m, -1, 1],
    [m, bounds.h - m, 1, -1],
    [bounds.w - m, bounds.h - m, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * len, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * len);
    ctx.stroke();
  }
}

function drawAmbientParticles() {
  ctx.fillStyle = "#cdd8c4";
  for (const p of ambientParticles) {
    ctx.globalAlpha = p.a;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const p = player;
  const flashing = p.invulnMs > 0 && Math.floor(elapsed * 20) % 2 === 0;

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + p.radius * 0.55, p.radius * 0.9, p.radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (p.dashing) {
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = 0.16 * (4 - i);
      ctx.fillStyle = "#7dd3fc";
      ctx.beginPath();
      ctx.arc(p.x - p.dashDirX * i * 10, p.y - p.dashDirY * i * 10, p.radius * (1 - i * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = flashing ? 0.45 : 1;

  const pulse = 1 + Math.sin(elapsed * 3) * 0.04;
  ctx.strokeStyle = p.dashing ? "rgba(125,211,252,0.5)" : "rgba(78,161,255,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, p.radius * 1.35 * pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.rotate(p.facing);

  const grad = ctx.createRadialGradient(-p.radius * 0.3, -p.radius * 0.3, 1, 0, 0, p.radius);
  grad.addColorStop(0, p.dashing ? "#bdeeff" : "#a8d4ff");
  grad.addColorStop(1, p.dashing ? "#4fb8e0" : "#3172c4");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(10,20,30,0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#0e1a26";
  ctx.fillRect(p.radius - 2, -3, 15, 6);
  ctx.fillStyle = "#e2f2ff";
  ctx.beginPath();
  ctx.arc(p.radius + 13, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();

  if (p.meleeSwingT > 0) {
    ctx.globalAlpha = p.meleeSwingT * 0.7;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.meleeRange, -PLAYER.meleeArc / 2, PLAYER.meleeArc / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function shade(hex, amt) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((ch) => ch + ch).join("") : c;
  const num = parseInt(full, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  const target = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((target - r) * p) + r;
  g = Math.round((target - g) * p) + g;
  b = Math.round((target - b) * p) + b;
  return `rgb(${r},${g},${b})`;
}

function drawEyes(z) {
  const ang = angleTo(z.x, z.y, player.x, player.y);
  const ex = Math.cos(ang) * z.radius * 0.35;
  const ey = Math.sin(ang) * z.radius * 0.35;
  const spread = z.radius * 0.22;
  const perpX = -Math.sin(ang) * spread;
  const perpY = Math.cos(ang) * spread;
  ctx.fillStyle = "#ff3b3b";
  ctx.shadowColor = "#ff3b3b";
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(ex + perpX, ey + perpY, 1.6, 0, Math.PI * 2);
  ctx.arc(ex - perpX, ey - perpY, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawWalkerBody(z) {
  const grad = ctx.createRadialGradient(-z.radius * 0.3, -z.radius * 0.3, 1, 0, 0, z.radius);
  grad.addColorStop(0, shade(z.color, 0.22));
  grad.addColorStop(1, shade(z.color, -0.25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (!z._spots) {
    z._spots = Array.from({ length: 2 }, () => ({ a: randRange(0, Math.PI * 2), d: randRange(0.2, 0.6), r: randRange(0.25, 0.4) }));
  }
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (const s of z._spots) {
    ctx.beginPath();
    ctx.arc(Math.cos(s.a) * z.radius * s.d, Math.sin(s.a) * z.radius * s.d, z.radius * s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  drawEyes(z);
}

function drawRunnerBody(z) {
  const ang = angleTo(z.x, z.y, player.x, player.y);
  ctx.save();
  ctx.rotate(ang);
  const grad = ctx.createLinearGradient(-z.radius, 0, z.radius, 0);
  grad.addColorStop(0, shade(z.color, -0.25));
  grad.addColorStop(1, shade(z.color, 0.25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, z.radius * 1.3, z.radius * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-z.radius * 1.3 - i * 6, 0);
    ctx.lineTo(-z.radius * 1.3 - i * 6 - 8, 0);
    ctx.stroke();
  }
  ctx.restore();
  drawEyes(z);
}

function drawBruteBody(z) {
  if (!z._jag) {
    z._jag = Array.from({ length: 8 }, () => randRange(0.82, 1.18));
  }
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = z.radius * z._jag[i];
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(-z.radius * 0.3, -z.radius * 0.3, 1, 0, 0, z.radius * 1.2);
  grad.addColorStop(0, shade(z.color, 0.12));
  grad.addColorStop(1, shade(z.color, -0.35));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();
  drawEyes(z);
}

function drawSpitterBody(z, now) {
  const grad = ctx.createRadialGradient(-z.radius * 0.2, -z.radius * 0.2, 1, 0, 0, z.radius);
  grad.addColorStop(0, shade(z.color, 0.2));
  grad.addColorStop(1, shade(z.color, -0.3));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const pulse = 0.5 + Math.sin(now * 0.006 + z.uid) * 0.5;
  ctx.fillStyle = `rgba(150,255,120,${0.35 + pulse * 0.4})`;
  ctx.shadowColor = "#96ff78";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(0, 0, z.radius * 0.4 * (0.8 + pulse * 0.3), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawScreamerBody(z, now) {
  const grad = ctx.createRadialGradient(-z.radius * 0.3, -z.radius * 0.3, 1, 0, 0, z.radius);
  grad.addColorStop(0, shade(z.color, 0.2));
  grad.addColorStop(1, shade(z.color, -0.3));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const ang = angleTo(z.x, z.y, player.x, player.y);
  ctx.save();
  ctx.rotate(ang);
  const mouthOpen = 0.35 + Math.abs(Math.sin(now * 0.008)) * 0.35;
  ctx.fillStyle = "rgba(10,5,15,0.85)";
  ctx.beginPath();
  ctx.moveTo(z.radius * 0.2, 0);
  ctx.arc(0, 0, z.radius * 0.6, -mouthOpen, mouthOpen);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBossBody(z, now) {
  const spin = now * 0.0006;
  ctx.save();
  ctx.rotate(spin);
  ctx.fillStyle = "rgba(20,20,35,0.9)";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(z.radius * 0.7, -z.radius * 0.18);
    ctx.lineTo(z.radius * 1.08, 0);
    ctx.lineTo(z.radius * 0.7, z.radius * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  const grad = ctx.createRadialGradient(-z.radius * 0.3, -z.radius * 0.3, 1, 0, 0, z.radius * 0.75);
  grad.addColorStop(0, "#6b6b8f");
  grad.addColorStop(1, "#2a2a3f");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, z.radius * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(244,63,94,0.7)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const pulse = 0.5 + Math.sin(now * 0.004) * 0.5;
  ctx.fillStyle = `rgba(244,63,94,${0.4 + pulse * 0.3})`;
  ctx.shadowColor = "#f43f5e";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(0, 0, z.radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  drawEyes(z);
}

function drawEnemies() {
  const now = performance.now();
  for (const z of enemies) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(z.x, z.y + z.radius * 0.5, z.radius * 0.85, z.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(z.x, z.y);
    if (z.buffedUntil > now) {
      ctx.shadowColor = "#e879f9";
      ctx.shadowBlur = 16;
    }

    if (z.isBoss) drawBossBody(z, now);
    else if (z.type === "brute") drawBruteBody(z);
    else if (z.type === "runner") drawRunnerBody(z);
    else if (z.type === "spitter") drawSpitterBody(z, now);
    else if (z.type === "screamer") drawScreamerBody(z, now);
    else drawWalkerBody(z);

    if (z.burnUntil > now) drawBurningOverlay(z, now);

    if (z.hitFlashUntil > now) {
      ctx.globalAlpha = clamp((z.hitFlashUntil - now) / 90, 0, 1) * 0.7;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, z.radius * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (z.isBoss && z.telegraph > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,80,80,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius + 16 + Math.sin(now * 0.02) * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (z.isBoss || z.maxHp > 40) {
      const w = z.radius * 2.2;
      const pct = clamp(z.hp / z.maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(z.x - w / 2, z.y - z.radius - 14, w, 6);
      ctx.fillStyle = z.isBoss ? "#f43f5e" : "#f59e0b";
      ctx.fillRect(z.x - w / 2, z.y - z.radius - 14, w * pct, 6);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(z.x - w / 2, z.y - z.radius - 14, w, 6);
    }
    if (z.isBoss) {
      ctx.fillStyle = "#f4f4f4";
      ctx.font = "600 13px 'Rajdhani', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(z.name, z.x, z.y - z.radius - 20);
    }
  }
}

function drawProjectiles(list, hostile = false) {
  for (const p of list) {
    if (p.trail && p.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = hostile ? "rgba(143,227,107,0.35)" : hexAlpha(p.color, 0.35);
      ctx.lineWidth = Math.max(1, p.radius * 0.8);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.trail[0].x, p.trail[0].y);
      for (let i = 1; i < p.trail.length; i++) ctx.lineTo(p.trail[i].x, p.trail[i].y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = hostile ? "#8fe36b" : p.color;
    ctx.shadowBlur = p.mode === "grenade" ? 10 : 6;
    ctx.fillStyle = hostile ? "#8fe36b" : p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function hexAlpha(hex, alpha) {
  const a = Math.round(clamp(alpha, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

function drawMuzzleFlashes() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const m of muzzleFlashes) {
    const t = clamp(m.age / m.life, 0, 1);
    const len = 22 * (1 - t);
    const tipX = m.x + Math.cos(m.angle) * len;
    const tipY = m.y + Math.sin(m.angle) * len;
    const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 12 * (1 - t * 0.4));
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.4, m.color);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 10 * (1 - t * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3 * (1 - t);
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFlames() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const f of flameParticles) {
    if (f.smoke) continue;
    const t = clamp(f.age / f.life, 0, 1);
    const x = f.x + f.vx * f.age;
    const y = f.y + f.vy * f.age;
    const r = Math.max(1, f.size * (1 - t * 0.5));
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (t < 0.4) {
      grad.addColorStop(0, "rgba(255,244,190,0.95)");
      grad.addColorStop(0.5, "rgba(255,168,40,0.85)");
      grad.addColorStop(1, "rgba(255,90,20,0)");
    } else {
      grad.addColorStop(0, "rgba(255,150,40,0.7)");
      grad.addColorStop(0.6, "rgba(210,60,20,0.5)");
      grad.addColorStop(1, "rgba(120,20,10,0)");
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  for (const f of flameParticles) {
    if (!f.smoke) continue;
    const t = clamp(f.age / f.life, 0, 1);
    const x = f.x + f.vx * f.age;
    const y = f.y + f.vy * f.age;
    const r = f.size * (0.6 + t * 0.8);
    ctx.fillStyle = `rgba(60,55,50,${0.28 * (1 - t)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBurningOverlay(z, now) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const flicker = 0.6 + Math.sin(now * 0.02 + z.uid) * 0.4;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + now * 0.003;
    const ox = Math.cos(a) * z.radius * 0.35;
    const oy = Math.sin(a) * z.radius * 0.35 - z.radius * 0.25;
    const r = z.radius * 0.4;
    const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    grad.addColorStop(0, `rgba(255,205,90,${0.85 * flicker})`);
    grad.addColorStop(0.6, `rgba(255,110,30,${0.55 * flicker})`);
    grad.addColorStop(1, "rgba(255,60,10,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPickups() {
  for (const p of pickups) {
    const bob = Math.sin(p.bob) * 3;
    ctx.save();
    if (p.kind === "currency") {
      ctx.shadowColor = "#ffd23f";
      ctx.shadowBlur = 6;
      const grad = ctx.createRadialGradient(p.x - 2, p.y + bob - 2, 0, p.x, p.y + bob, 6);
      grad.addColorStop(0, "#fff3c4");
      grad.addColorStop(1, "#d99a1c");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.shadowColor = "#4ade80";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#173a22";
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = "#a4f5be";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 3.5, p.y + bob);
      ctx.lineTo(p.x + 3.5, p.y + bob);
      ctx.moveTo(p.x, p.y + bob - 3.5);
      ctx.lineTo(p.x, p.y + bob + 3.5);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPopups() {
  ctx.textAlign = "center";
  ctx.font = "700 15px 'Rajdhani', sans-serif";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  for (const t of popups) {
    ctx.globalAlpha = clamp(1 - t.age / t.life, 0, 1);
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawAbilityVisuals() {
  if (!player) return;
  const now = performance.now();
  for (const ab of player.abilities) {
    if (ab.id === "orbitingBlades" && ab.extra.positions) {
      for (const pos of ab.extra.positions) {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate((ab.extra.angle || 0) * 2);
        ctx.fillStyle = "#dfe8f0";
        ctx.shadowColor = "#c9d6e3";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-4, -4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else if (ab.id === "homingShards" && ab.extra.list) {
      for (const s of ab.extra.list) {
        const a = Math.atan2(s.vy, s.vx);
        ctx.save();
        ctx.strokeStyle = "rgba(143,211,255,0.5)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(s.x - Math.cos(a) * 14, s.y - Math.sin(a) * 14);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        ctx.fillStyle = "#c9ecff";
        ctx.shadowColor = "#8fd3ff";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (ab.id === "staticField" && ab.extra.radius) {
      const t = (now % 1000) / 1000;
      ctx.strokeStyle = `rgba(192,132,252,${0.45 * (1 - t)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, ab.extra.radius * (0.7 + t * 0.3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(192,132,252,0.28)";
      ctx.beginPath();
      ctx.arc(player.x, player.y, ab.extra.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ab.id === "landmine" && ab.extra.list) {
      for (const m of ab.extra.list) {
        const ready = m.armed <= 0;
        const blink = ready ? 0.5 + Math.sin(now * 0.01) * 0.5 : 1;
        ctx.fillStyle = ready ? `rgba(249,115,22,${0.7 + blink * 0.3})` : "#8a5a1a";
        ctx.beginPath();
        ctx.arc(m.x, m.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (ready) {
          ctx.strokeStyle = `rgba(249,115,22,${0.25 * blink})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 12 + blink * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if (ab.id === "chainLightning" && ab.extra.bolts) {
      ctx.save();
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#facc15";
      ctx.shadowBlur = 6;
      for (const b of ab.extra.bolts) {
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        const segs = 4;
        for (let i = 1; i < segs; i++) {
          const t = i / segs;
          const mx = b.x1 + (b.x2 - b.x1) * t + randRange(-6, 6);
          const my = b.y1 + (b.y2 - b.y1) * t + randRange(-6, 6);
          ctx.lineTo(mx, my);
        }
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
      }
      ctx.restore();
    } else if (ab.id === "shockwaveStomp" && ab.extra.pulseAt) {
      const age = (now - ab.extra.pulseAt) / 1000;
      if (age >= 0 && age < 0.4) {
        const t = age / 0.4;
        ctx.strokeStyle = `rgba(52,211,153,${0.55 * (1 - t)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(player.x, player.y, ab.extra.radius * t, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(52,211,153,${0.3 * (1 - t)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x, player.y, ab.extra.radius * t * 0.7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

function drawFog() {
  const grad = ctx.createRadialGradient(
    player.x,
    player.y,
    120,
    player.x,
    player.y,
    Math.max(bounds.w, bounds.h) * 0.6
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(10,2,2,0.75)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, bounds.w, bounds.h);
}

function drawLowHealthVignette() {
  const hpPct = player.hp / player.maxHp;
  const pulse = 0.35 + Math.sin(elapsed * 6) * 0.15;
  const intensity = clamp((0.3 - hpPct) / 0.3, 0, 1);
  const grad = ctx.createRadialGradient(
    bounds.w / 2,
    bounds.h / 2,
    Math.min(bounds.w, bounds.h) * 0.3,
    bounds.w / 2,
    bounds.h / 2,
    Math.max(bounds.w, bounds.h) * 0.7
  );
  grad.addColorStop(0, "rgba(180,20,20,0)");
  grad.addColorStop(1, `rgba(180,20,20,${intensity * pulse})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, bounds.w, bounds.h);
}

// ---- Game over ---------------------------------------------------------------
function gameOver() {
  screen = "gameover";
  const stats = {
    wave: waveManager.wave,
    kills: player.kills,
    timeAlive: elapsed,
    currency: player.currency,
  };
  const scores = saveRun(stats);
  UI.renderGameOver(stats, scores);
  UI.setHudVisible(false);
}

// ---- Shop --------------------------------------------------------------------
function renderShopScreen() {
  UI.renderShop(player, waveManager.wave + 1, {
    onBuyPerk: (id) => {
      buyPerk(player, id);
      renderShopScreen();
    },
    onBuyUnlock: (id) => {
      buyWeaponUnlock(player, id);
      renderShopScreen();
    },
    onBuyUpgrade: (id, track) => {
      buyWeaponUpgrade(player, id, track);
      renderShopScreen();
    },
  });
}

// ---- Loop ----------------------------------------------------------------
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;

  if (Input.wasPressed("Escape") && (screen === "playing" || screen === "paused")) {
    setScreen(screen === "playing" ? "paused" : "playing");
  }

  updateAmbientParticles(dt);

  if (screen === "playing") {
    update(dt, ts);
  } else if (screen === "waveclear") {
    waveClearTimer -= dt;
    if (waveClearTimer <= 0) {
      UI.hideWaveBanner();
      setScreen("shop");
      renderShopScreen();
    }
  }

  render();
  Input.endFrame();

  // Read-only debug snapshot for the browser console / QA tooling.
  window.__uoDebug = { screen, player, enemies, waveManager, friendlyProjectiles, enemyProjectiles };
}

requestAnimationFrame(frame);
