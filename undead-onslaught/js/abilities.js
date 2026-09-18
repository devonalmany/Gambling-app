// Auto-triggering abilities. Each entry on player.abilities is
// { id, level, timer, extra }; `extra` is a scratch object each ability's
// update() owns for its own persistent bits (mines on the field, shard
// projectiles, per-target hit-cooldown maps, ...).
import { dist, angleTo, clamp } from "./utils.js";
import { applyKnockback } from "./enemies.js";

export const ABILITY_IDS = [
  "orbitingBlades",
  "homingShards",
  "staticField",
  "landmine",
  "chainLightning",
  "shockwaveStomp",
];

export const ABILITY_DEFS = {
  orbitingBlades: {
    name: "Orbiting Blades",
    icon: "🗡",
    color: "#c9d6e3",
    maxLevel: 5,
    desc: (lvl) => {
      const s = bladeStats(lvl);
      return `${s.count} blades, ${s.dmg.toFixed(0)} dmg/hit, orbit radius ${s.radius}.`;
    },
  },
  homingShards: {
    name: "Homing Shards",
    icon: "✦",
    color: "#8fd3ff",
    maxLevel: 5,
    desc: (lvl) => {
      const s = shardStats(lvl);
      return `Fires a homing shard every ${s.interval.toFixed(1)}s for ${s.dmg} dmg${s.pierce ? `, pierces ${s.pierce}` : ""}.`;
    },
  },
  staticField: {
    name: "Static Field",
    icon: "◎",
    color: "#c084fc",
    maxLevel: 5,
    desc: (lvl) => {
      const s = fieldStats(lvl);
      return `Damage aura, radius ${s.radius}, ${s.dmg.toFixed(0)} dmg/tick.`;
    },
  },
  landmine: {
    name: "Landmine Drop",
    icon: "✷",
    color: "#f97316",
    maxLevel: 5,
    desc: (lvl) => {
      const s = mineStats(lvl);
      return `Drops a mine every ${s.interval.toFixed(1)}s, ${s.dmg} AOE dmg.`;
    },
  },
  chainLightning: {
    name: "Chain Lightning",
    icon: "⚡",
    color: "#facc15",
    maxLevel: 5,
    desc: (lvl) => {
      const s = chainStats(lvl);
      return `Strikes nearest foe every ${s.interval.toFixed(1)}s, arcs to ${s.jumps} more.`;
    },
  },
  shockwaveStomp: {
    name: "Shockwave Stomp",
    icon: "◉",
    color: "#34d399",
    maxLevel: 5,
    desc: (lvl) => {
      const s = stompStats(lvl);
      return `Knockback pulse every ${s.interval.toFixed(1)}s, ${s.dmg.toFixed(0)} dmg.`;
    },
  },
};

function bladeStats(lvl) {
  return { count: 1 + lvl, dmg: 7 + lvl * 3, radius: 62 + lvl * 6, spin: 2.4 + lvl * 0.35, hitCd: 0.35 };
}
function shardStats(lvl) {
  return { interval: Math.max(0.6, 1.5 - lvl * 0.16), dmg: 10 + lvl * 5, speed: 340, pierce: lvl >= 3 ? lvl - 2 : 0 };
}
function fieldStats(lvl) {
  return { radius: 70 + lvl * 14, dmg: 5 + lvl * 3.2, tick: 1.0 };
}
function mineStats(lvl) {
  return { interval: Math.max(1.4, 3.2 - lvl * 0.3), dmg: 24 + lvl * 12, radius: 55 + lvl * 6, trigger: 40, maxAlive: 2 + lvl };
}
function chainStats(lvl) {
  return { interval: Math.max(1.0, 2.6 - lvl * 0.25), dmg: 14 + lvl * 5, jumps: 1 + lvl, range: 160 };
}
function stompStats(lvl) {
  return { interval: Math.max(2.0, 4.5 - lvl * 0.4), dmg: 8 + lvl * 4, radius: 90 + lvl * 12, force: 260 + lvl * 30 };
}

export function newAbilityState(id) {
  return { id, level: 1, timer: 0, extra: {} };
}

export function updateAbilities(player, dt, ctx) {
  const { now, enemies, damageEnemy, arenaBounds } = ctx;
  const dmgMul = player.perks.abilityDamageMul;
  const cdMul = player.perks.cooldownReductionMul;

  for (const ab of player.abilities) {
    switch (ab.id) {
      case "orbitingBlades":
        updateBlades(ab, player, dt, enemies, damageEnemy, dmgMul, now);
        break;
      case "homingShards":
        updateShards(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, arenaBounds);
        break;
      case "staticField":
        updateField(ab, player, dt, enemies, damageEnemy, dmgMul, now);
        break;
      case "landmine":
        updateMines(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, now);
        break;
      case "chainLightning":
        updateChain(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul);
        break;
      case "shockwaveStomp":
        updateStomp(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, now);
        break;
    }
  }
}

function updateBlades(ab, player, dt, enemies, damageEnemy, dmgMul, now) {
  const s = bladeStats(ab.level);
  ab.extra.angle = (ab.extra.angle ?? 0) + s.spin * dt;
  ab.extra.lastHit = ab.extra.lastHit ?? {};
  const positions = [];
  for (let i = 0; i < s.count; i++) {
    const a = ab.extra.angle + (i * Math.PI * 2) / s.count;
    positions.push({ x: player.x + Math.cos(a) * s.radius, y: player.y + Math.sin(a) * s.radius });
  }
  ab.extra.positions = positions;
  for (const z of enemies) {
    const key = z.uid;
    const lastHit = ab.extra.lastHit[key] ?? 0;
    if (now - lastHit < s.hitCd * 1000) continue;
    for (const pos of positions) {
      if (dist(pos.x, pos.y, z.x, z.y) <= z.radius + 10) {
        damageEnemy(z, s.dmg * dmgMul);
        ab.extra.lastHit[key] = now;
        break;
      }
    }
  }
}

function updateShards(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, bounds) {
  const s = shardStats(ab.level);
  ab.extra.list = ab.extra.list ?? [];
  ab.timer -= dt;
  if (ab.timer <= 0 && enemies.length) {
    ab.timer = s.interval * cdMul;
    const target = nearestEnemy(player.x, player.y, enemies);
    if (target) {
      const a = angleTo(player.x, player.y, target.x, target.y);
      ab.extra.list.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(a) * s.speed,
        vy: Math.sin(a) * s.speed,
        targetUid: target.uid,
        pierceLeft: s.pierce,
        hit: new Set(),
        life: 3.5,
      });
    }
  }
  for (let i = ab.extra.list.length - 1; i >= 0; i--) {
    const shard = ab.extra.list[i];
    shard.life -= dt;
    const target = enemies.find((e) => e.uid === shard.targetUid);
    if (target) {
      const a = angleTo(shard.x, shard.y, target.x, target.y);
      const turn = 6 * dt;
      const curAngle = Math.atan2(shard.vy, shard.vx);
      const diff = normalizeAngle(a - curAngle);
      const newAngle = curAngle + clamp(diff, -turn, turn);
      const speed = Math.hypot(shard.vx, shard.vy);
      shard.vx = Math.cos(newAngle) * speed;
      shard.vy = Math.sin(newAngle) * speed;
    }
    shard.x += shard.vx * dt;
    shard.y += shard.vy * dt;
    let removed = false;
    for (const z of enemies) {
      if (shard.hit.has(z.uid)) continue;
      if (dist(shard.x, shard.y, z.x, z.y) <= z.radius + 6) {
        damageEnemy(z, s.dmg * dmgMul);
        shard.hit.add(z.uid);
        if (shard.pierceLeft <= 0) {
          removed = true;
        } else {
          shard.pierceLeft -= 1;
        }
        break;
      }
    }
    if (
      removed ||
      shard.life <= 0 ||
      shard.x < -40 ||
      shard.x > bounds.w + 40 ||
      shard.y < -40 ||
      shard.y > bounds.h + 40
    ) {
      ab.extra.list.splice(i, 1);
    }
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function updateField(ab, player, dt, enemies, damageEnemy, dmgMul, now) {
  const s = fieldStats(ab.level);
  ab.timer -= dt;
  if (ab.timer <= 0) {
    ab.timer = s.tick;
    for (const z of enemies) {
      if (dist(player.x, player.y, z.x, z.y) <= s.radius + z.radius) {
        damageEnemy(z, s.dmg * dmgMul);
      }
    }
  }
  ab.extra.radius = s.radius;
}

function updateMines(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, now) {
  const s = mineStats(ab.level);
  ab.extra.list = ab.extra.list ?? [];
  ab.timer -= dt;
  if (ab.timer <= 0 && ab.extra.list.length < s.maxAlive) {
    ab.timer = s.interval * cdMul;
    ab.extra.list.push({ x: player.x, y: player.y, armed: 0.3 });
  }
  for (let i = ab.extra.list.length - 1; i >= 0; i--) {
    const mine = ab.extra.list[i];
    if (mine.armed > 0) {
      mine.armed -= dt;
      continue;
    }
    let triggered = false;
    for (const z of enemies) {
      if (dist(mine.x, mine.y, z.x, z.y) <= s.trigger + z.radius) {
        triggered = true;
        break;
      }
    }
    if (triggered) {
      for (const z of enemies) {
        if (dist(mine.x, mine.y, z.x, z.y) <= s.radius) {
          damageEnemy(z, s.dmg * dmgMul);
          const a = angleTo(mine.x, mine.y, z.x, z.y);
          applyKnockback(z, Math.cos(a), Math.sin(a), 180);
        }
      }
      ab.extra.list.splice(i, 1);
    }
  }
}

function updateChain(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul) {
  const s = chainStats(ab.level);
  ab.timer -= dt;
  ab.extra.bolts = ab.extra.bolts ?? [];
  ab.extra.bolts = ab.extra.bolts.filter((b) => (b.ttl -= dt) > 0);
  if (ab.timer <= 0 && enemies.length) {
    ab.timer = s.interval * cdMul;
    let current = nearestEnemy(player.x, player.y, enemies);
    let fromX = player.x;
    let fromY = player.y;
    const hit = new Set();
    let dmg = s.dmg;
    for (let jump = 0; current && jump <= s.jumps; jump++) {
      damageEnemy(current, dmg * dmgMul);
      hit.add(current.uid);
      ab.extra.bolts.push({ x1: fromX, y1: fromY, x2: current.x, y2: current.y, ttl: 0.15 });
      fromX = current.x;
      fromY = current.y;
      dmg *= 0.82;
      const next = enemies
        .filter((e) => !hit.has(e.uid) && dist(fromX, fromY, e.x, e.y) <= s.range)
        .sort((a, b) => dist(fromX, fromY, a.x, a.y) - dist(fromX, fromY, b.x, b.y))[0];
      current = next;
    }
  }
}

function updateStomp(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, now) {
  const s = stompStats(ab.level);
  ab.timer -= dt;
  if (ab.timer <= 0) {
    ab.timer = s.interval * cdMul;
    ab.extra.pulseAt = now;
    ab.extra.radius = s.radius;
    for (const z of enemies) {
      const d = dist(player.x, player.y, z.x, z.y);
      if (d <= s.radius + z.radius) {
        damageEnemy(z, s.dmg * dmgMul);
        const a = angleTo(player.x, player.y, z.x, z.y);
        applyKnockback(z, Math.cos(a), Math.sin(a), s.force);
      }
    }
  }
}

function nearestEnemy(x, y, enemies) {
  let best = null;
  let bestD = Infinity;
  for (const z of enemies) {
    const d = dist(x, y, z.x, z.y);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

export function abilityLevelStats(id, level) {
  switch (id) {
    case "orbitingBlades":
      return bladeStats(level);
    case "homingShards":
      return shardStats(level);
    case "staticField":
      return fieldStats(level);
    case "landmine":
      return mineStats(level);
    case "chainLightning":
      return chainStats(level);
    case "shockwaveStomp":
      return stompStats(level);
    default:
      return {};
  }
}
