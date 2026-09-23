import { PLAYER, WAVE } from "./constants.js";
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
import { updateAbilities, isMagnetActive } from "./abilities.js";
import { generateLevelUpCards, applyCard } from "./levelup.js";
import { buyPerk, buyWeaponUnlock, buyWeaponUpgrade } from "./shop.js";
import { createWaveManager, startWave, updateWaveManager, isWaveClear } from "./waves.js";
import { getMap } from "./maps.js";
import { dist, angleTo, clamp, randRange, randInt } from "./utils.js";
import * as Render3D from "./render3d.js";

const canvas = document.getElementById("game");

let bounds = { w: window.innerWidth, h: window.innerHeight };
let groundTexture = null;
let selectedCharacterId = "rookie";
let selectedMapId = "compound";
let currentMap = getMap(selectedMapId);
let hazards = [];
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
  bounds = { w: window.innerWidth, h: window.innerHeight };
  Render3D.resize(bounds.w, bounds.h);
  groundTexture = buildGroundTexture(bounds.w, bounds.h, currentMap);
  Render3D.setGround(groundTexture, currentMap);
}

// A painted ground, baked once per resize/run instead of drawn live: base
// gradient wash, patchy blotches, cracks, and scattered rubble — palette
// and density driven by the selected map (see maps.js).
function buildGroundTexture(w, h, mapDef) {
  const palette = mapDef.palette;
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(w));
  off.height = Math.max(1, Math.round(h));
  const g = off.getContext("2d");

  const grad = g.createRadialGradient(w * 0.5, h * 0.42, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  grad.addColorStop(0, palette.base[0]);
  grad.addColorStop(0.55, palette.base[1]);
  grad.addColorStop(1, palette.base[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // mottled dirt/rot patches
  const patchCount = Math.round((w * h) / 26000);
  for (let i = 0; i < patchCount; i++) {
    const x = randRange(0, w);
    const y = randRange(0, h);
    const r = randRange(30, 110);
    const tone = choiceWeighted(palette.patchTones);
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
  g.strokeStyle = `rgba(0,0,0,${palette.crackAlpha})`;
  g.lineWidth = 1.4;
  const crackCount = Math.round(((w * h) / 90000) * palette.crackDensityMul);
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

  // decorative vent covers baked under each hazard position (Foundry map)
  for (const hz of mapDef.hazards) {
    drawVentCover(g, hz.fx * w, hz.fy * h, hz.radius * 0.7);
  }

  // vignette baked into the texture itself
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  return off;
}

function drawVentCover(g, x, y, r) {
  g.save();
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(255,120,40,0.3)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "rgba(20,15,10,0.6)";
  g.lineWidth = 2.5;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(x - r * 0.8, y + i * r * 0.28);
    g.lineTo(x + r * 0.8, y + i * r * 0.28);
    g.stroke();
  }
  g.restore();
}

function choiceWeighted(tones) {
  return tones[Math.floor(Math.random() * tones.length)];
}

Render3D.init(canvas);
Render3D.initWorldUI(document.getElementById("worldUI"));
window.addEventListener("resize", resize);
resize();
Input.init(canvas);
refreshAmbientParticles();

// ---- Ambient particles, re-skinned per battleground ------------------------
// Each map gets its own atmosphere instead of one generic dust field:
// drifting embers over the Foundry's vents, slow fog wisps in the Boneyard,
// tumbling dead leaves in Suburbia, and plain dust over the Compound.
function ambientProfileFor(mapId) {
  switch (mapId) {
    case "foundry":
      return { count: 30, kind: "ember", colors: ["#ff9a3c", "#ffcf7a", "#ff6a1f"], vy: [-70, -30], vx: [-8, 8], r: [1, 2.6], a: [0.25, 0.6] };
    case "boneyard":
      return { count: 14, kind: "fog", colors: ["#cfd8d2"], vy: [-6, 6], vx: [-9, 9], r: [40, 90], a: [0.03, 0.08] };
    case "suburbia":
      return { count: 20, kind: "leaf", colors: ["#c99a3d", "#8a9a3d", "#a3722c"], vy: [10, 26], vx: [-14, 14], r: [3, 5.5], a: [0.35, 0.7] };
    default:
      return { count: 26, kind: "dust", colors: ["#cdd8c4"], vy: [-10, -3], vx: [-6, 6], r: [0.8, 2.2], a: [0.05, 0.16] };
  }
}
function refreshAmbientParticles() {
  const profile = ambientProfileFor(currentMap.id);
  ambientParticles = Array.from({ length: profile.count }, () => ({
    x: randRange(0, bounds.w),
    y: randRange(0, bounds.h),
    vx: randRange(profile.vx[0], profile.vx[1]),
    vy: randRange(profile.vy[0], profile.vy[1]),
    r: randRange(profile.r[0], profile.r[1]),
    a: randRange(profile.a[0], profile.a[1]),
    rot: randRange(0, Math.PI * 2),
    vr: randRange(-1.2, 1.2),
    sway: randRange(0, Math.PI * 2),
    kind: profile.kind,
    color: profile.colors[Math.floor(Math.random() * profile.colors.length)],
  }));
}
function updateAmbientParticles(dt) {
  for (const p of ambientParticles) {
    p.sway += dt;
    const swayX = p.kind === "leaf" || p.kind === "ember" ? Math.sin(p.sway * 1.6) * (p.kind === "leaf" ? 18 : 10) * dt : 0;
    p.x += p.vx * dt + swayX;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const pad = p.kind === "fog" ? p.r : 10;
    if (p.y < -pad) {
      p.y = bounds.h + pad;
      p.x = randRange(0, bounds.w);
    }
    if (p.y > bounds.h + pad) {
      p.y = -pad;
      p.x = randRange(0, bounds.w);
    }
    if (p.x < -pad) p.x = bounds.w + pad;
    if (p.x > bounds.w + pad) p.x = -pad;
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

document.getElementById("startBtn").addEventListener("click", openLoadout);
document.getElementById("loadoutBackBtn").addEventListener("click", () => setScreen("start"));
document.getElementById("deployBtn").addEventListener("click", startGame);
document.getElementById("restartBtn").addEventListener("click", startGame);
document.getElementById("shopNextWaveBtn").addEventListener("click", startNextWave);
document.getElementById("resumeBtn").addEventListener("click", () => setScreen("playing"));
document.getElementById("pauseRestartBtn").addEventListener("click", startGame);

function openLoadout() {
  setScreen("loadout");
  renderLoadout();
}

function renderLoadout() {
  UI.renderLoadoutScreen(
    { characterId: selectedCharacterId, mapId: selectedMapId },
    {
      onSelectCharacter: (id) => {
        selectedCharacterId = id;
        renderLoadout();
      },
      onSelectMap: (id) => {
        selectedMapId = id;
        renderLoadout();
      },
    }
  );
}

function startGame() {
  currentMap = getMap(selectedMapId);
  refreshAmbientParticles();
  player = createPlayer(bounds.w, bounds.h, selectedCharacterId);
  player.perks.currencyGainMul *= currentMap.modifiers.currencyMul;
  player.perks.xpGainMul *= currentMap.modifiers.xpMul;
  enemies = [];
  friendlyProjectiles = [];
  enemyProjectiles = [];
  pickups = [];
  popups = [];
  waveManager = createWaveManager();
  elapsed = 0;
  pendingLevelUps = 0;
  forceAbilityCardQueued = false;
  groundTexture = buildGroundTexture(bounds.w, bounds.h, currentMap);
  Render3D.setGround(groundTexture, currentMap);
  hazards = currentMap.hazards.map((h) => ({
    x: h.fx * bounds.w,
    y: h.fy * bounds.h,
    radius: h.radius,
    damage: h.damage,
    cycle: h.cycle,
    timer: randRange(h.cycle * 0.3, h.cycle),
  }));
  UI.setHudVisible(true);
  setScreen("playing");
  beginWave(1);
  lastTs = performance.now();
}

function beginWave(wave) {
  player.damageTakenThisWave = false;
  startWave(waveManager, wave, enemies, bounds);
  UI.renderWaveBanner(wave, false, 0, waveManager.isBossWave);
  bannerTimer = waveManager.isBossWave ? 2.2 : 1.6;
  if (waveManager.isBossWave) addShake(8, 0.5);
  if (wave === 3 && player.abilities.length === 0) {
    forceAbilityCardQueued = true;
  }
}

function startNextWave() {
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
  } else if (next === "loadout") {
    UI.showScreen("loadoutScreen");
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

// Mouse wheel cycling through unlocked weapons — the only way to reach
// weapons beyond the direct 1-0 hotkeys.
function cycleWeapon(dir) {
  const unlocked = WEAPON_ORDER.filter((id) => player.weapons[id].unlocked);
  if (unlocked.length < 2) return;
  const idx = unlocked.indexOf(player.currentWeapon);
  const next = unlocked[(idx + dir + unlocked.length) % unlocked.length];
  player.currentWeapon = next;
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
  stats.damage *= player.perks.weaponDamageMul;

  if (w.fireTimer > 0) w.fireTimer -= dt;

  const aim = computeAimAngle();
  const firing = isFiring();

  if (def.mode === "cone") {
    if (firing && w.fireTimer <= 0) {
      w.fireTimer = 1 / stats.fireRate;
      const half = (def.coneDeg * Math.PI) / 180 / 2;
      for (const z of enemies) {
        const a = angleTo(player.x, player.y, z.x, z.y);
        const d = dist(player.x, player.y, z.x, z.y);
        if (d <= stats.range + z.radius && Math.abs(normDiff(a, aim)) <= half) {
          damageEnemy(z, stats.damage);
          igniteEnemy(z, stats.damage, now);
        }
      }
      spawnFlameCone(player.x, player.y, aim, stats.range);
      spawnMuzzleFlash(aim, "#ff8c28");
    }
    return;
  }

  if (def.mode === "lob") {
    if (firing && w.fireTimer <= 0) {
      w.fireTimer = 1 / stats.fireRate;
      spawnProjectile(friendlyProjectiles, {
        x: player.x,
        y: player.y,
        angle: aim + randRange(-0.02, 0.02),
        speed: def.bulletSpeed,
        damage: stats.damage,
        pierce: 0,
        explosive: true,
        explosionRadius: stats.explosionRadius,
        explosionDamageMul: 1,
        radius: 6,
        mode: "grenade",
        fuse: 0.85,
        color: "#a3e635",
      });
      spawnMuzzleFlash(aim, "#a3e635");
    }
    return;
  }

  if (def.mode === "beam") {
    if (firing && w.fireTimer <= 0) {
      w.fireTimer = 1 / stats.fireRate;
      fireRailgun(aim, stats, def);
    }
    return;
  }

  if (def.mode === "hitscan") {
    if (firing && w.fireTimer <= 0) {
      w.fireTimer = 1 / stats.fireRate;
      fireLaser(aim, stats, def);
    }
    return;
  }

  if (def.mode === "melee") {
    if (firing && w.fireTimer <= 0) {
      w.fireTimer = 1 / stats.fireRate;
      const half = (def.coneDeg * Math.PI) / 180 / 2;
      for (const z of enemies) {
        const a = angleTo(player.x, player.y, z.x, z.y);
        const d = dist(player.x, player.y, z.x, z.y);
        if (d <= stats.range + z.radius && Math.abs(normDiff(a, aim)) <= half) {
          damageEnemy(z, stats.damage);
        }
      }
      spawnSparkBurst(player.x, player.y, aim);
    }
    return;
  }

  // projectile mode (pistol/shotgun/smg/rifle/sniper/minigun/crossbow/rocketLauncher)
  if (player.currentWeapon === "minigun") {
    w.holdTime = firing ? Math.min(def.spinUpTime, w.holdTime + dt) : Math.max(0, w.holdTime - dt * 2);
  }

  if (firing && w.fireTimer <= 0) {
    w.fireTimer = 1 / stats.fireRate;
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
  // The camera is angled, not a straight 1:1 top-down projection, so the
  // mouse's screen position has to be raycast against the ground plane to
  // find the world point it's actually pointing at.
  const ground = Render3D.screenToGround(Input.mouse.x, Input.mouse.y);
  if (!ground) return player.facing;
  return angleTo(player.x, player.y, ground.x, ground.y);
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

// Railgun: an instant hitscan line that pierces every zombie standing in it.
const railBeams = [];
function fireRailgun(angle, stats, def) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const beamWidth = def.beamWidth ?? 6;
  const hits = [];
  for (const z of enemies) {
    if (z.hp <= 0) continue;
    const rx = z.x - player.x;
    const ry = z.y - player.y;
    const proj = rx * dx + ry * dy;
    if (proj < 0 || proj > def.range) continue;
    const perp = Math.abs(rx * dy - ry * dx);
    if (perp <= z.radius + beamWidth / 2) hits.push({ z, proj });
  }
  hits.sort((a, b) => a.proj - b.proj);
  for (const { z } of hits) {
    const crit = Math.random() < stats.critChance;
    const dmg = crit ? stats.damage * 2 : stats.damage;
    damageEnemy(z, dmg);
    applyKnockback(z, dx, dy, 90);
    popups.push({
      x: z.x,
      y: z.y - 10,
      text: crit ? `${Math.round(dmg)}!` : `${Math.round(dmg)}`,
      life: 0.45,
      age: 0,
      color: crit ? "#ff5c5c" : "#e2ecff",
    });
    spawnImpactSparks(z.x, z.y, crit ? "#ff5c5c" : "#bfe8ff", crit);
  }
  railBeams.push({
    x1: player.x,
    y1: player.y,
    x2: player.x + dx * def.range,
    y2: player.y + dy * def.range,
    life: 0.16,
    age: 0,
  });
  spawnMuzzleFlash(angle, "#bfe8ff");
  addShake(4, 0.12);
}

// Laser Rifle: instant hitscan, but stops at the first zombie in the line —
// no piercing, just a fast precise single-target zap.
const laserBeams = [];
function fireLaser(angle, stats, def) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let closest = null;
  let closestProj = Infinity;
  for (const z of enemies) {
    if (z.hp <= 0) continue;
    const rx = z.x - player.x;
    const ry = z.y - player.y;
    const proj = rx * dx + ry * dy;
    if (proj < 0 || proj > def.range) continue;
    const perp = Math.abs(rx * dy - ry * dx);
    if (perp <= z.radius + 3 && proj < closestProj) {
      closest = z;
      closestProj = proj;
    }
  }
  const endDist = closest ? closestProj : def.range;
  if (closest) {
    const crit = Math.random() < stats.critChance;
    const dmg = crit ? stats.damage * 2 : stats.damage;
    damageEnemy(closest, dmg);
    popups.push({
      x: closest.x,
      y: closest.y - 10,
      text: crit ? `${Math.round(dmg)}!` : `${Math.round(dmg)}`,
      life: 0.4,
      age: 0,
      color: crit ? "#ff5c5c" : "#bbf7d0",
    });
    spawnImpactSparks(closest.x, closest.y, crit ? "#ff5c5c" : "#86efac", crit);
  }
  laserBeams.push({
    x1: player.x,
    y1: player.y,
    x2: player.x + dx * endDist,
    y2: player.y + dy * endDist,
    life: 0.08,
    age: 0,
  });
  spawnMuzzleFlash(angle, "#86efac");
}

// Chainsaw: a burst of sparks at melee range instead of a flame cone.
const sparkParticles = [];
function spawnSparkBurst(x, y, angle) {
  for (let i = 0; i < 5; i++) {
    const a = angle + randRange(-0.5, 0.5);
    const speed = randRange(120, 260);
    sparkParticles.push({
      x: x + Math.cos(angle) * 30,
      y: y + Math.sin(angle) * 30,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: randRange(0.12, 0.22),
      age: 0,
      color: "#ffd666",
    });
  }
}

// Impact sparks at a hit point, radiating in every direction — used for
// every bullet/beam hit so contact reads as an actual impact, not just a
// floating number. Crits get more of them and a brighter color.
function spawnImpactSparks(x, y, color, crit) {
  const count = crit ? 9 : 4;
  for (let i = 0; i < count; i++) {
    const a = randRange(0, Math.PI * 2);
    const speed = randRange(80, crit ? 260 : 160);
    sparkParticles.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: randRange(0.1, crit ? 0.26 : 0.18),
      age: 0,
      color,
    });
  }
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
      damageEnemy(z, PLAYER.meleeDamage * player.perks.meleeDamageMul);
      applyKnockback(z, Math.cos(a), Math.sin(a), PLAYER.meleeKnockback);
    }
  }
}

// ---- Damage / death handling -----------------------------------------------
function damageEnemy(z, amount) {
  z.hp -= amount;
  z.hitFlashUntil = performance.now() + 90;
}

// Gib burst + shockwave ring at a kill site — the only visual sign a kill
// happened used to be the enemy silently vanishing.
const deathParticles = [];
function spawnDeathBurst(x, y, color, big) {
  const count = big ? 14 : 7;
  for (let i = 0; i < count; i++) {
    const a = randRange(0, Math.PI * 2);
    const speed = randRange(60, big ? 260 : 170);
    deathParticles.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      size: randRange(2.5, big ? 7 : 5),
      rot: randRange(0, Math.PI * 2),
      vr: randRange(-8, 8),
      color,
      life: randRange(0.35, 0.55),
      age: 0,
    });
  }
  deathParticles.push({ ring: true, x, y, color, life: 0.3, age: 0, maxR: big ? 46 : 28 });
}

function killRewardsAndCleanup() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const z = enemies[i];
    if (z.hp > 0) continue;
    grantXpAndMaybeLevel(z.xp);
    spawnCurrencyDrop(pickups, z.x, z.y, z.currency);
    maybeSpawnHealthDrop(pickups, z.x, z.y);
    player.kills += 1;
    spawnDeathBurst(z.x, z.y, z.color ?? "#8fe36b", !!z.isBoss || z.maxHp > 40);
    popups.push({ x: z.x, y: z.y, text: z.isBoss ? "BOSS DOWN" : "+" + z.xp + "xp", life: 0.8, age: 0, color: "#ffe066" });
    enemies.splice(i, 1);
  }
}

function grantXpAndMaybeLevel(amount) {
  const leveled = grantXp(player, amount);
  if (leveled.length) pendingLevelUps += leveled.length;
}

function onPlayerHit(dmg, dirX, dirY) {
  const { hurt, blocked } = damagePlayer(player, dmg);
  if (hurt || blocked) {
    player.x -= dirX * 6;
    player.y -= dirY * 6;
    if (hurt) {
      popups.push({ x: player.x, y: player.y - 20, text: `-${Math.round(dmg)}`, life: 0.6, age: 0, color: "#ff6b6b" });
      addShake(clamp(dmg * 0.15, 1, 8), 0.12);
    } else {
      popups.push({ x: player.x, y: player.y - 20, text: "BLOCKED", life: 0.6, age: 0, color: "#8fd3ff" });
      addShake(2, 0.08);
    }
  }
}

// ---- Environmental hazards (Foundry steam vents) ---------------------------
function updateHazards(dt) {
  for (const hz of hazards) {
    hz.timer -= dt;
    if (hz.timer <= 0) {
      hz.timer = hz.cycle;
      const d = dist(player.x, player.y, hz.x, hz.y);
      if (d <= hz.radius + player.radius) {
        const a = angleTo(hz.x, hz.y, player.x, player.y);
        onPlayerHit(hz.damage, Math.cos(a), Math.sin(a));
      }
    }
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
    if (def.key && Input.wasPressed(def.key)) switchWeapon(id);
  }
  const wheelStep = Input.consumeWheelStep();
  if (wheelStep !== 0) cycleWeapon(wheelStep);
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
  updateHazards(dt);

  killRewardsAndCleanup();

  updatePickups(pickups, dt, player, pickupRadius(player), isMagnetActive(player), (p) => {
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
  for (let i = railBeams.length - 1; i >= 0; i--) {
    railBeams[i].age += dt;
    if (railBeams[i].age >= railBeams[i].life) railBeams.splice(i, 1);
  }
  for (let i = laserBeams.length - 1; i >= 0; i--) {
    laserBeams[i].age += dt;
    if (laserBeams[i].age >= laserBeams[i].life) laserBeams.splice(i, 1);
  }
  for (let i = sparkParticles.length - 1; i >= 0; i--) {
    sparkParticles[i].age += dt;
    if (sparkParticles[i].age >= sparkParticles[i].life) sparkParticles.splice(i, 1);
  }
  for (let i = deathParticles.length - 1; i >= 0; i--) {
    deathParticles[i].age += dt;
    if (deathParticles[i].age >= deathParticles[i].life) deathParticles.splice(i, 1);
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
  spawnImpactSparks(p.x, p.y, p.crit ? "#ff5c5c" : p.color, p.crit);
  if (p.crit) addShake(1.5, 0.05);
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
// All the actual drawing lives in render3d.js; this just hands it the live
// game state each frame and lets it diff that against its own pool of
// Three.js meshes / DOM overlay elements.
function render() {
  const appEl = document.getElementById("app");
  if (!player) {
    Render3D.render();
    return;
  }

  appEl.classList.toggle("low-hp", player.hp / player.maxHp < 0.3);
  Render3D.setFogActive(currentMap.modifiers.fogAlways || waveManager.wave >= 16);
  Render3D.setShake(shakeMag);
  Render3D.sync({
    player,
    enemies,
    friendlyProjectiles,
    enemyProjectiles,
    pickups,
    popups,
    hazards,
    ambientParticles,
    muzzleFlashes,
    railBeams,
    laserBeams,
    sparkParticles,
    flameParticles,
    deathParticles,
    now: performance.now(),
  });
  Render3D.render();
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
  window.__uoDebug = {
    screen,
    player,
    enemies,
    waveManager,
    friendlyProjectiles,
    enemyProjectiles,
    hazards,
    currentMap,
    selectedCharacterId,
    selectedMapId,
  };
}

requestAnimationFrame(frame);
