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
import { dist, angleTo, clamp, randRange } from "./utils.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let bounds = { w: window.innerWidth, h: window.innerHeight };

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  bounds = { w: window.innerWidth, h: window.innerHeight };
  canvas.width = Math.round(bounds.w * dpr);
  canvas.height = Math.round(bounds.h * dpr);
  canvas.style.width = `${bounds.w}px`;
  canvas.style.height = `${bounds.h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();
Input.init(canvas);

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

  const aim = angleTo(player.x, player.y, Input.mouse.x, Input.mouse.y);

  if (def.mode === "cone") {
    if (Input.mouse.down && !w.reloading && w.ammoInMag > 0 && w.fireTimer <= 0) {
      w.fireTimer = 1 / stats.fireRate;
      w.ammoInMag -= 1;
      const half = (def.coneDeg * Math.PI) / 180 / 2;
      for (const z of enemies) {
        const a = angleTo(player.x, player.y, z.x, z.y);
        const d = dist(player.x, player.y, z.x, z.y);
        if (d <= def.range + z.radius && Math.abs(normDiff(a, aim)) <= half) {
          damageEnemy(z, stats.damage);
        }
      }
      spawnFlameParticle(player.x, player.y, aim);
      if (w.ammoInMag <= 0) startReload(w, def);
    }
    return;
  }

  if (def.mode === "lob") {
    if (Input.mouse.down && !w.reloading && w.ammoInMag > 0 && w.fireTimer <= 0) {
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
      if (w.ammoInMag <= 0) startReload(w, def);
    }
    return;
  }

  // projectile mode (pistol/shotgun/smg/rifle/sniper/minigun)
  if (player.currentWeapon === "minigun") {
    w.holdTime = Input.mouse.down ? Math.min(def.spinUpTime, w.holdTime + dt) : Math.max(0, w.holdTime - dt * 2);
  }

  if (Input.mouse.down && !w.reloading && w.fireTimer <= 0) {
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

const flameParticles = [];
function spawnFlameParticle(x, y, angle) {
  flameParticles.push({ x, y, angle: angle + randRange(-0.35, 0.35), life: 0.25, age: 0 });
}

// ---- Melee shove -----------------------------------------------------------
function tryMelee() {
  if (player.meleeCooldownLeft > 0) return;
  player.meleeCooldownLeft = PLAYER.meleeCooldown;
  player.meleeSwingT = 1;
  const aim = angleTo(player.x, player.y, Input.mouse.x, Input.mouse.y);
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
  player.facing = angleTo(player.x, player.y, Input.mouse.x, Input.mouse.y);

  for (const id of WEAPON_ORDER) {
    const def = WEAPON_DEFS[id];
    if (Input.wasPressed(def.key)) switchWeapon(id);
  }
  updateWeapon(dt, now);

  if (Input.wasPressed("Space") || Input.wasPressed("ShiftLeft")) tryDash(player, moveVec);
  if (Input.wasPressed("KeyE")) tryMelee();

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

  updateWaveManager(waveManager, dt, enemies, bounds);

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
  drawArena();

  if (!player) return;

  drawPickups();
  drawAbilityVisuals();
  drawFlames();
  drawProjectiles(friendlyProjectiles);
  drawProjectiles(enemyProjectiles, true);
  drawEnemies();
  drawPlayer();
  drawPopups();

  if (waveManager.wave >= 16) drawFog();
}

function drawArena() {
  ctx.fillStyle = "#141b12";
  ctx.fillRect(0, 0, bounds.w, bounds.h);
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  const grid = 56;
  for (let x = 0; x < bounds.w; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, bounds.h);
    ctx.stroke();
  }
  for (let y = 0; y < bounds.h; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(bounds.w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,80,80,0.25)";
  ctx.lineWidth = 3;
  ctx.strokeRect(ARENA_MARGIN / 2, ARENA_MARGIN / 2, bounds.w - ARENA_MARGIN, bounds.h - ARENA_MARGIN);
}

function drawPlayer() {
  const p = player;
  const flashing = p.invulnMs > 0 && Math.floor(elapsed * 20) % 2 === 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.facing);
  ctx.globalAlpha = flashing ? 0.45 : 1;
  ctx.fillStyle = p.dashing ? "#7dd3fc" : "#4ea1ff";
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e2f2ff";
  ctx.beginPath();
  ctx.moveTo(p.radius + 6, 0);
  ctx.lineTo(p.radius - 4, -6);
  ctx.lineTo(p.radius - 4, 6);
  ctx.closePath();
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

function drawEnemies() {
  for (const z of enemies) {
    ctx.save();
    ctx.translate(z.x, z.y);
    if (z.buffedUntil > performance.now()) {
      ctx.shadowColor = "#e879f9";
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = z.color;
    ctx.beginPath();
    ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
    ctx.fill();
    if (z.isBoss && z.telegraph > 0) {
      ctx.strokeStyle = "rgba(255,80,80,0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, z.radius + 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (z.isBoss || z.maxHp > 40) {
      const w = z.radius * 2.2;
      const pct = clamp(z.hp / z.maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(z.x - w / 2, z.y - z.radius - 12, w, 5);
      ctx.fillStyle = z.isBoss ? "#f43f5e" : "#f59e0b";
      ctx.fillRect(z.x - w / 2, z.y - z.radius - 12, w * pct, 5);
    }
  }
}

function drawProjectiles(list, hostile = false) {
  for (const p of list) {
    ctx.fillStyle = hostile ? "#8fe36b" : p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFlames() {
  ctx.fillStyle = "rgba(255,140,40,0.55)";
  for (const f of flameParticles) {
    const r = 10 + f.age * 60;
    ctx.beginPath();
    ctx.arc(f.x + Math.cos(f.angle) * f.age * 140, f.y + Math.sin(f.angle) * f.age * 140, Math.max(2, 10 - f.age * 20), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPickups() {
  for (const p of pickups) {
    const bob = Math.sin(p.bob) * 3;
    ctx.fillStyle = p.kind === "currency" ? "#ffd23f" : "#4ade80";
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, p.kind === "currency" ? 5 : 7, 0, Math.PI * 2);
    ctx.fill();
    if (p.kind === "health") {
      ctx.strokeStyle = "#0f2b18";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 3, p.y + bob);
      ctx.lineTo(p.x + 3, p.y + bob);
      ctx.moveTo(p.x, p.y + bob - 3);
      ctx.lineTo(p.x, p.y + bob + 3);
      ctx.stroke();
    }
  }
}

function drawPopups() {
  ctx.textAlign = "center";
  ctx.font = "600 13px system-ui, sans-serif";
  for (const t of popups) {
    ctx.globalAlpha = clamp(1 - t.age / t.life, 0, 1);
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
      ctx.fillStyle = "#c9d6e3";
      for (const pos of ab.extra.positions) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (ab.id === "homingShards" && ab.extra.list) {
      ctx.fillStyle = "#8fd3ff";
      for (const s of ab.extra.list) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (ab.id === "staticField" && ab.extra.radius) {
      ctx.strokeStyle = "rgba(192,132,252,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, ab.extra.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ab.id === "landmine" && ab.extra.list) {
      for (const m of ab.extra.list) {
        ctx.fillStyle = m.armed > 0 ? "#facc15" : "#f97316";
        ctx.beginPath();
        ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (ab.id === "chainLightning" && ab.extra.bolts) {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2;
      for (const b of ab.extra.bolts) {
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
      }
    } else if (ab.id === "shockwaveStomp" && ab.extra.pulseAt) {
      const age = (now - ab.extra.pulseAt) / 1000;
      if (age >= 0 && age < 0.35) {
        ctx.strokeStyle = `rgba(52,211,153,${0.6 - age}) `;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(player.x, player.y, ab.extra.radius * (age / 0.35), 0, Math.PI * 2);
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
  grad.addColorStop(1, "rgba(0,0,0,0.72)");
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
  window.__uoDebug = { screen, player, enemies, waveManager };
}

requestAnimationFrame(frame);
