import { clamp, dist, angleTo, randRange } from "./utils.js";
import { spawnProjectile } from "./projectiles.js";

export const ZOMBIE_DEFS = {
  walker: {
    id: "walker",
    name: "Walker",
    radius: 15,
    hp: 22,
    speed: 62,
    contactDamage: 8,
    attackInterval: 0.9,
    color: "#6fae52",
    ccResist: 0,
    xp: 3,
    currency: 2,
    minWave: 1,
  },
  runner: {
    id: "runner",
    name: "Runner",
    radius: 12,
    hp: 14,
    speed: 150,
    contactDamage: 7,
    attackInterval: 0.7,
    color: "#c97a3d",
    ccResist: 0.15,
    xp: 4,
    currency: 3,
    minWave: 3,
  },
  brute: {
    id: "brute",
    name: "Brute",
    radius: 24,
    hp: 160,
    speed: 42,
    contactDamage: 22,
    attackInterval: 1.1,
    color: "#7a3b3b",
    ccResist: 0.65,
    xp: 14,
    currency: 12,
    minWave: 6,
  },
  spitter: {
    id: "spitter",
    name: "Spitter",
    radius: 14,
    hp: 26,
    speed: 55,
    contactDamage: 5,
    attackInterval: 1.0,
    color: "#7fbf4a",
    ccResist: 0.1,
    xp: 6,
    currency: 5,
    minWave: 7,
    ranged: true,
    preferredRange: 230,
    rangedRange: 340,
    rangedCooldown: 1.8,
    rangedDamage: 10,
  },
  screamer: {
    id: "screamer",
    name: "Screamer",
    radius: 15,
    hp: 34,
    speed: 58,
    contactDamage: 0,
    attackInterval: 999,
    color: "#a24fae",
    ccResist: 0.8,
    xp: 10,
    currency: 8,
    minWave: 12,
    isBuffer: true,
    preferredRange: 260,
    buffInterval: 4.5,
    buffRadius: 220,
    summonInterval: 9,
  },
};

export function spawnBoss(list, wave, bounds) {
  const scale = 1 + Math.floor(wave / 5) * 0.55;
  const edge = pickEdgePoint(bounds);
  list.push({
    uid: cryptoId(),
    type: "boss",
    name: `Horde Boss (Wave ${wave})`,
    x: edge.x,
    y: edge.y,
    vx: 0,
    vy: 0,
    radius: 40 * Math.min(1.6, 1 + scale * 0.12),
    hp: 900 * scale,
    maxHp: 900 * scale,
    speed: 46,
    contactDamage: 26 * scale,
    attackInterval: 1.2,
    attackTimer: 0,
    color: "#3d3d54",
    ccResist: 0.9,
    xp: 120,
    currency: 220,
    isBoss: true,
    phaseTimer: randRange(2, 3),
    telegraph: 0,
    charging: false,
    chargeDirX: 0,
    chargeDirY: 0,
    burnUntil: 0,
    burnTickTimer: 0,
    burnTickDamage: 0,
  });
}

function pickEdgePoint(bounds) {
  const side = Math.floor(Math.random() * 4);
  const pad = 30;
  if (side === 0) return { x: randRange(0, bounds.w), y: -pad };
  if (side === 1) return { x: bounds.w + pad, y: randRange(0, bounds.h) };
  if (side === 2) return { x: randRange(0, bounds.w), y: bounds.h + pad };
  return { x: -pad, y: randRange(0, bounds.h) };
}

let uidCounter = 1;
function cryptoId() {
  return uidCounter++;
}

export function spawnZombie(list, typeId, wave, bounds) {
  const def = ZOMBIE_DEFS[typeId];
  const hpMul = 1 + (wave - 1) * 0.13;
  const speedMul = Math.min(1.5, 1 + (wave - 1) * 0.015);
  const dmgMul = 1 + (wave - 1) * 0.07;
  const edge = pickEdgePoint(bounds);
  list.push({
    uid: cryptoId(),
    type: def.id,
    name: def.name,
    x: edge.x,
    y: edge.y,
    vx: 0,
    vy: 0,
    radius: def.radius,
    hp: def.hp * hpMul,
    maxHp: def.hp * hpMul,
    speed: def.speed * speedMul,
    baseSpeed: def.speed * speedMul,
    contactDamage: def.contactDamage * dmgMul,
    attackInterval: def.attackInterval,
    attackTimer: randRange(0, def.attackInterval),
    color: def.color,
    ccResist: def.ccResist,
    xp: def.xp,
    currency: def.currency,
    ranged: !!def.ranged,
    preferredRange: def.preferredRange ?? 0,
    rangedRange: def.rangedRange ?? 0,
    rangedCooldown: def.rangedCooldown ?? 1,
    rangedTimer: randRange(0, def.rangedCooldown ?? 1),
    rangedDamage: def.rangedDamage ?? 0,
    isBuffer: !!def.isBuffer,
    buffInterval: def.buffInterval ?? 0,
    buffTimer: randRange(0.5, def.buffInterval ?? 1),
    summonInterval: def.summonInterval ?? 0,
    summonTimer: randRange(2, def.summonInterval ?? 4),
    buffedUntil: 0,
    slowUntil: 0,
    slowFactor: 1,
    knockbackDecay: 0,
    burnUntil: 0,
    burnTickTimer: 0,
    burnTickDamage: 0,
  });
}

export function applyKnockback(z, dirX, dirY, force) {
  const resist = z.isBoss ? 0.85 : z.ccResist;
  const mag = force * (1 - resist);
  z.vx += dirX * mag;
  z.vy += dirY * mag;
}

export function applySlow(z, factor, durationMs, now) {
  const resist = z.ccResist ?? 0;
  const effectiveFactor = 1 - (1 - factor) * (1 - resist);
  z.slowFactor = Math.min(z.slowFactor, effectiveFactor);
  z.slowUntil = Math.max(z.slowUntil, now + durationMs);
}

export function updateEnemies(list, dt, player, ctx) {
  const { bounds, enemyProjectiles, now, onPlayerHit, spawnExtra } = ctx;

  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i];
    if (z.hp <= 0) continue;

    if (z.slowUntil && now > z.slowUntil) z.slowFactor = 1;

    // knockback velocity decays quickly
    if (z.vx || z.vy) {
      z.x += z.vx * dt;
      z.y += z.vy * dt;
      z.vx *= 0.86;
      z.vy *= 0.86;
      if (Math.abs(z.vx) < 2) z.vx = 0;
      if (Math.abs(z.vy) < 2) z.vy = 0;
    }

    const d = dist(z.x, z.y, player.x, player.y);
    const ang = angleTo(z.x, z.y, player.x, player.y);
    const speedNow = z.speed * (z.slowFactor ?? 1) * (z.buffedUntil > now ? 1.35 : 1);

    if (z.isBoss) {
      updateBoss(z, dt, player, ang, d, now, onPlayerHit);
    } else if (z.isBuffer) {
      // Screamers hang back, buff nearby zombies, occasionally summon.
      if (d > z.preferredRange) {
        z.x += Math.cos(ang) * speedNow * dt;
        z.y += Math.sin(ang) * speedNow * dt;
      } else if (d < z.preferredRange - 60) {
        z.x -= Math.cos(ang) * speedNow * 0.6 * dt;
        z.y -= Math.sin(ang) * speedNow * 0.6 * dt;
      }
      z.buffTimer -= dt;
      if (z.buffTimer <= 0) {
        z.buffTimer = z.buffInterval;
        for (const other of list) {
          if (other === z || other.isBoss) continue;
          if (dist(z.x, z.y, other.x, other.y) <= z.buffRadius || dist(z.x, z.y, other.x, other.y) <= 220) {
            other.buffedUntil = now + 3000;
          }
        }
      }
      z.summonTimer -= dt;
      if (z.summonTimer <= 0) {
        z.summonTimer = z.summonInterval;
        spawnExtra(z.x, z.y);
      }
    } else if (z.ranged) {
      if (d > z.preferredRange + 20) {
        z.x += Math.cos(ang) * speedNow * dt;
        z.y += Math.sin(ang) * speedNow * dt;
      } else if (d < z.preferredRange - 20) {
        z.x -= Math.cos(ang) * speedNow * dt;
        z.y -= Math.sin(ang) * speedNow * dt;
      }
      z.rangedTimer -= dt;
      if (z.rangedTimer <= 0 && d <= z.rangedRange) {
        z.rangedTimer = z.rangedCooldown;
        spawnProjectile(enemyProjectiles, {
          x: z.x,
          y: z.y,
          angle: ang,
          speed: 260,
          damage: z.rangedDamage,
          radius: 6,
          hostile: true,
          color: "#8fe36b",
        });
      }
    } else {
      // Walker / Runner / Brute: beeline for the player.
      z.x += Math.cos(ang) * speedNow * dt;
      z.y += Math.sin(ang) * speedNow * dt;
      z.attackTimer -= dt;
      if (d <= z.radius + player.radius + 4 && z.attackTimer <= 0) {
        z.attackTimer = z.attackInterval;
        const dmg = z.contactDamage * (z.buffedUntil > now ? 1.35 : 1);
        onPlayerHit(dmg, Math.cos(ang), Math.sin(ang));
      }
    }

    z.x = clamp(z.x, -60, bounds.w + 60);
    z.y = clamp(z.y, -60, bounds.h + 60);
  }
}

function updateBoss(z, dt, player, ang, d, now, onPlayerHit) {
  if (z.charging) {
    z.x += z.chargeDirX * 480 * dt;
    z.y += z.chargeDirY * 480 * dt;
    z.phaseTimer -= dt;
    if (dist(z.x, z.y, player.x, player.y) <= z.radius + player.radius) {
      onPlayerHit(z.contactDamage * 1.4, z.chargeDirX, z.chargeDirY);
    }
    if (z.phaseTimer <= 0) {
      z.charging = false;
      z.phaseTimer = randRange(2.5, 4);
    }
    return;
  }

  if (z.telegraph > 0) {
    z.telegraph -= dt;
    if (z.telegraph <= 0) {
      if (d < 140) {
        // Ground slam: AOE around current position.
        if (d <= 150) onPlayerHit(z.contactDamage * 1.1, Math.cos(ang), Math.sin(ang));
      } else {
        z.charging = true;
        z.chargeDirX = Math.cos(ang);
        z.chargeDirY = Math.sin(ang);
        z.phaseTimer = 0.5;
      }
    }
    return;
  }

  z.phaseTimer -= dt;
  z.x += Math.cos(ang) * z.speed * dt;
  z.y += Math.sin(ang) * z.speed * dt;
  z.attackTimer -= dt;
  if (d <= z.radius + player.radius + 4 && z.attackTimer <= 0) {
    z.attackTimer = z.attackInterval;
    onPlayerHit(z.contactDamage, Math.cos(ang), Math.sin(ang));
  }
  if (z.phaseTimer <= 0) {
    z.telegraph = 0.6;
    z.phaseTimer = randRange(3, 4.5);
  }
}

export function weightedTypesForWave(wave) {
  const pool = [];
  pool.push({ item: "walker", weight: 10 });
  if (wave >= 3) pool.push({ item: "runner", weight: 6 });
  if (wave >= 6) pool.push({ item: "brute", weight: 3 });
  if (wave >= 7) pool.push({ item: "spitter", weight: 4 });
  if (wave >= 12) pool.push({ item: "screamer", weight: 2 });
  return pool;
}
