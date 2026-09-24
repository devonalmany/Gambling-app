// Auto-triggering abilities. Each entry on player.abilities is
// { id, level, timer, extra }; `extra` is a scratch object each ability's
// update() owns for its own persistent bits (mines on the field, shard
// projectiles, per-target hit-cooldown maps, ...).
import { dist, angleTo, clamp, randRange } from "./utils.js";
import { applyKnockback, applySlow } from "./enemies.js";
import { healPlayer } from "./player.js";

export const ABILITY_IDS = [
  "orbitingBlades",
  "homingShards",
  "staticField",
  "landmine",
  "chainLightning",
  "shockwaveStomp",
  "guardianDrone",
  "frostTrail",
  "magnetPulse",
  "swarmBots",
  "boomerangBlade",
  "throwingKnives",
  "fireVolcano",
  "holyNova",
  "ricochetRound",
  "guardianShield",
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
  guardianDrone: {
    name: "Guardian Drone",
    icon: "◈",
    color: "#38bdf8",
    maxLevel: 5,
    desc: (lvl) => {
      const s = droneStats(lvl);
      return `Orbiting drone zaps foes within ${s.range} range for ${s.dmg} dmg every ${s.interval.toFixed(1)}s.`;
    },
  },
  frostTrail: {
    name: "Frost Trail",
    icon: "❄",
    color: "#93c5fd",
    maxLevel: 5,
    desc: (lvl) => {
      const s = frostStats(lvl);
      return `Leaves a chilling trail, ${s.dmg.toFixed(0)} dmg/tick and slows anything standing in it.`;
    },
  },
  magnetPulse: {
    name: "Magnet Pulse",
    icon: "⊕",
    color: "#fbbf24",
    maxLevel: 5,
    desc: (lvl) => {
      const s = magnetStats(lvl);
      return `Pulls every drop on the field to you for ${s.duration.toFixed(1)}s, every ${s.interval.toFixed(1)}s.`;
    },
  },
  swarmBots: {
    name: "Swarm Bots",
    icon: "◇",
    color: "#a3e635",
    maxLevel: 5,
    desc: (lvl) => {
      const s = swarmStats(lvl);
      return `Launches ${s.count} seeker bot${s.count > 1 ? "s" : ""} every ${s.interval.toFixed(1)}s, ${s.dmg} AOE dmg on impact.`;
    },
  },
  boomerangBlade: {
    name: "Boomerang Blade",
    icon: "↻",
    color: "#94a3b8",
    maxLevel: 5,
    desc: (lvl) => {
      const s = boomerangStats(lvl);
      return `Throws a blade ${s.range}px out and back every ${s.interval.toFixed(1)}s, ${s.dmg} dmg per pass.`;
    },
  },
  throwingKnives: {
    name: "Throwing Knives",
    icon: "†",
    color: "#fca5a5",
    maxLevel: 5,
    desc: (lvl) => {
      const s = knivesStats(lvl);
      return `Volley of ${s.count} piercing knives every ${s.interval.toFixed(1)}s, ${s.dmg} dmg each.`;
    },
  },
  fireVolcano: {
    name: "Fire Volcano",
    icon: "▲",
    color: "#dc2626",
    maxLevel: 5,
    desc: (lvl) => {
      const s = volcanoStats(lvl);
      return `Erupts a burning patch every ${s.interval.toFixed(1)}s, ${s.dmg.toFixed(0)} dmg/tick, radius ${s.radius}.`;
    },
  },
  holyNova: {
    name: "Holy Nova",
    icon: "❋",
    color: "#fde68a",
    maxLevel: 5,
    desc: (lvl) => {
      const s = novaStats(lvl);
      return `Radius ${s.radius} burst every ${s.interval.toFixed(1)}s, ${s.dmg.toFixed(0)} dmg + heals ${s.heal} HP.`;
    },
  },
  ricochetRound: {
    name: "Ricochet Round",
    icon: "↯",
    color: "#fb7185",
    maxLevel: 5,
    desc: (lvl) => {
      const s = ricochetStats(lvl);
      return `Fires a bouncing round every ${s.interval.toFixed(1)}s, ${s.dmg} dmg, bounces ${s.bounces}x.`;
    },
  },
  guardianShield: {
    name: "Guardian Shield",
    icon: "⛨",
    color: "#60a5fa",
    maxLevel: 5,
    desc: (lvl) => {
      const s = shieldStats(lvl);
      return `Grants a ${s.amount}-HP shield every ${s.interval.toFixed(1)}s that absorbs damage before HP.`;
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
function droneStats(lvl) {
  return { interval: Math.max(0.5, 1.3 - lvl * 0.12), dmg: 8 + lvl * 4, range: 220 + lvl * 20, orbitRadius: 46, orbitSpeed: 1.6 };
}
function frostStats(lvl) {
  return { spacing: 24, dmg: 3 + lvl * 1.6, life: 1.6 + lvl * 0.15, radius: 26 + lvl * 3, slowFactor: 0.45 - lvl * 0.04, tick: 0.4 };
}
function magnetStats(lvl) {
  return { interval: Math.max(4, 10 - lvl * 1.2), duration: 1.2 + lvl * 0.15 };
}
function swarmStats(lvl) {
  return { interval: Math.max(2.2, 5 - lvl * 0.4), count: 1 + Math.floor(lvl / 2), dmg: 14 + lvl * 6, radius: 34, speed: 260 };
}
function boomerangStats(lvl) {
  return { interval: Math.max(1.6, 3.4 - lvl * 0.3), dmg: 12 + lvl * 5, range: 220 + lvl * 15, speed: 420, hitCd: 0.3 };
}
function knivesStats(lvl) {
  return { interval: Math.max(1.0, 2.4 - lvl * 0.22), count: 3 + Math.floor(lvl / 2), dmg: 9 + lvl * 3, speed: 480, pierce: 2 + Math.floor(lvl / 2), spread: 0.22 };
}
function volcanoStats(lvl) {
  return { interval: Math.max(2.4, 5.5 - lvl * 0.5), dmg: 6 + lvl * 3, radius: 55 + lvl * 6, life: 3.5, tick: 0.5, range: 260 };
}
function novaStats(lvl) {
  return { interval: Math.max(3.5, 8 - lvl * 0.7), dmg: 16 + lvl * 7, radius: 100 + lvl * 14, heal: 3 + lvl * 2 };
}
function ricochetStats(lvl) {
  return { interval: Math.max(1.2, 2.8 - lvl * 0.25), dmg: 13 + lvl * 5, bounces: 2 + lvl, speed: 520, range: 200 };
}
function shieldStats(lvl) {
  return { interval: Math.max(5, 11 - lvl * 1.2), amount: 20 + lvl * 10 };
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
      case "guardianDrone":
        updateDrone(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, now);
        break;
      case "frostTrail":
        updateFrostTrail(ab, player, dt, enemies, damageEnemy, dmgMul, now);
        break;
      case "magnetPulse":
        updateMagnet(ab, dt, cdMul);
        break;
      case "swarmBots":
        updateSwarm(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul);
        break;
      case "boomerangBlade":
        updateBoomerang(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, now);
        break;
      case "throwingKnives":
        updateKnives(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, arenaBounds);
        break;
      case "fireVolcano":
        updateVolcano(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul);
        break;
      case "holyNova":
        updateNova(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, now);
        break;
      case "ricochetRound":
        updateRicochet(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul);
        break;
      case "guardianShield":
        updateShield(ab, player, dt, cdMul);
        break;
    }
  }
}

// Whether Magnet Pulse is in its active pull window right now — checked by
// main.js before calling updatePickups().
export function isMagnetActive(player) {
  return player.abilities.some((a) => a.id === "magnetPulse" && a.extra.activeLeft > 0);
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

function updateDrone(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, now) {
  const s = droneStats(ab.level);
  ab.extra.angle = (ab.extra.angle ?? 0) + s.orbitSpeed * dt;
  const dx = player.x + Math.cos(ab.extra.angle) * s.orbitRadius;
  const dy = player.y + Math.sin(ab.extra.angle) * s.orbitRadius;
  ab.extra.pos = { x: dx, y: dy };
  ab.extra.bolts = (ab.extra.bolts ?? []).filter((b) => (b.ttl -= dt) > 0);
  ab.timer -= dt;
  if (ab.timer <= 0) {
    const inRange = enemies.filter((e) => dist(dx, dy, e.x, e.y) <= s.range);
    const target = nearestEnemy(dx, dy, inRange);
    if (target) {
      ab.timer = s.interval * cdMul;
      damageEnemy(target, s.dmg * dmgMul);
      ab.extra.bolts.push({ x1: dx, y1: dy, x2: target.x, y2: target.y, ttl: 0.12 });
    }
  }
}

function updateFrostTrail(ab, player, dt, enemies, damageEnemy, dmgMul, now) {
  const s = frostStats(ab.level);
  ab.extra.list = ab.extra.list ?? [];
  ab.extra.lastX = ab.extra.lastX ?? player.x;
  ab.extra.lastY = ab.extra.lastY ?? player.y;
  if (dist(player.x, player.y, ab.extra.lastX, ab.extra.lastY) >= s.spacing) {
    ab.extra.list.push({ x: player.x, y: player.y, age: 0, tickTimer: 0 });
    ab.extra.lastX = player.x;
    ab.extra.lastY = player.y;
  }
  for (let i = ab.extra.list.length - 1; i >= 0; i--) {
    const seg = ab.extra.list[i];
    seg.age += dt;
    seg.tickTimer -= dt;
    if (seg.age >= s.life) {
      ab.extra.list.splice(i, 1);
      continue;
    }
    if (seg.tickTimer <= 0) {
      seg.tickTimer = s.tick;
      for (const z of enemies) {
        if (dist(seg.x, seg.y, z.x, z.y) <= s.radius + z.radius) {
          damageEnemy(z, s.dmg * dmgMul);
          applySlow(z, s.slowFactor, s.tick * 1000 + 150, now);
        }
      }
    }
  }
}

function updateMagnet(ab, dt, cdMul) {
  const s = magnetStats(ab.level);
  if (ab.extra.activeLeft > 0) ab.extra.activeLeft -= dt;
  ab.timer -= dt;
  if (ab.timer <= 0) {
    ab.timer = s.interval * cdMul;
    ab.extra.activeLeft = s.duration;
  }
}

function updateSwarm(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul) {
  const s = swarmStats(ab.level);
  ab.extra.list = ab.extra.list ?? [];
  ab.timer -= dt;
  if (ab.timer <= 0 && enemies.length) {
    ab.timer = s.interval * cdMul;
    for (let i = 0; i < s.count; i++) {
      const target = nearestEnemy(player.x, player.y, enemies);
      if (!target) break;
      const a = angleTo(player.x, player.y, target.x, target.y) + (i - (s.count - 1) / 2) * 0.3;
      ab.extra.list.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(a) * s.speed,
        vy: Math.sin(a) * s.speed,
        targetUid: target.uid,
        life: 3,
      });
    }
  }
  for (let i = ab.extra.list.length - 1; i >= 0; i--) {
    const bot = ab.extra.list[i];
    bot.life -= dt;
    const target = enemies.find((e) => e.uid === bot.targetUid);
    if (target) {
      const a = angleTo(bot.x, bot.y, target.x, target.y);
      const turn = 8 * dt;
      const curAngle = Math.atan2(bot.vy, bot.vx);
      const diff = normalizeAngle(a - curAngle);
      const newAngle = curAngle + clamp(diff, -turn, turn);
      const speed = Math.hypot(bot.vx, bot.vy);
      bot.vx = Math.cos(newAngle) * speed;
      bot.vy = Math.sin(newAngle) * speed;
    }
    bot.x += bot.vx * dt;
    bot.y += bot.vy * dt;
    let exploded = false;
    for (const z of enemies) {
      if (dist(bot.x, bot.y, z.x, z.y) <= z.radius + 8) {
        for (const z2 of enemies) {
          if (dist(bot.x, bot.y, z2.x, z2.y) <= s.radius) damageEnemy(z2, s.dmg * dmgMul);
        }
        exploded = true;
        break;
      }
    }
    if (exploded || bot.life <= 0) ab.extra.list.splice(i, 1);
  }
}

function updateBoomerang(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, now) {
  const s = boomerangStats(ab.level);
  ab.extra.list = ab.extra.list ?? [];
  ab.timer -= dt;
  if (ab.timer <= 0) {
    ab.timer = s.interval * cdMul;
    ab.extra.list.push({ x: player.x, y: player.y, angle: player.facing, dist: 0, returning: false, hit: {} });
  }
  for (let i = ab.extra.list.length - 1; i >= 0; i--) {
    const b = ab.extra.list[i];
    if (!b.returning) {
      b.x += Math.cos(b.angle) * s.speed * dt;
      b.y += Math.sin(b.angle) * s.speed * dt;
      b.dist += s.speed * dt;
      if (b.dist >= s.range) b.returning = true;
    } else {
      const a = angleTo(b.x, b.y, player.x, player.y);
      b.x += Math.cos(a) * s.speed * dt;
      b.y += Math.sin(a) * s.speed * dt;
      if (dist(b.x, b.y, player.x, player.y) < 20) {
        ab.extra.list.splice(i, 1);
        continue;
      }
    }
    for (const z of enemies) {
      const lastHit = b.hit[z.uid] ?? -Infinity;
      if (dist(b.x, b.y, z.x, z.y) <= z.radius + 10 && now - lastHit > s.hitCd * 1000) {
        damageEnemy(z, s.dmg * dmgMul);
        b.hit[z.uid] = now;
      }
    }
  }
}

function updateKnives(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, bounds) {
  const s = knivesStats(ab.level);
  ab.extra.list = ab.extra.list ?? [];
  ab.timer -= dt;
  if (ab.timer <= 0 && enemies.length) {
    ab.timer = s.interval * cdMul;
    const target = nearestEnemy(player.x, player.y, enemies);
    if (target) {
      const base = angleTo(player.x, player.y, target.x, target.y);
      for (let i = 0; i < s.count; i++) {
        const a = base + (i - (s.count - 1) / 2) * s.spread;
        ab.extra.list.push({
          x: player.x,
          y: player.y,
          vx: Math.cos(a) * s.speed,
          vy: Math.sin(a) * s.speed,
          pierceLeft: s.pierce,
          hit: new Set(),
          life: 1.4,
        });
      }
    }
  }
  for (let i = ab.extra.list.length - 1; i >= 0; i--) {
    const k = ab.extra.list[i];
    k.life -= dt;
    k.x += k.vx * dt;
    k.y += k.vy * dt;
    let removed = false;
    for (const z of enemies) {
      if (k.hit.has(z.uid)) continue;
      if (dist(k.x, k.y, z.x, z.y) <= z.radius + 5) {
        damageEnemy(z, s.dmg * dmgMul);
        k.hit.add(z.uid);
        if (k.pierceLeft <= 0) {
          removed = true;
        } else {
          k.pierceLeft -= 1;
        }
        break;
      }
    }
    if (removed || k.life <= 0 || k.x < -40 || k.x > bounds.w + 40 || k.y < -40 || k.y > bounds.h + 40) {
      ab.extra.list.splice(i, 1);
    }
  }
}

function updateVolcano(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul) {
  const s = volcanoStats(ab.level);
  ab.extra.list = ab.extra.list ?? [];
  ab.timer -= dt;
  if (ab.timer <= 0) {
    ab.timer = s.interval * cdMul;
    const nearby = enemies.filter((e) => dist(player.x, player.y, e.x, e.y) <= s.range);
    const target = nearby.length ? nearby[Math.floor(Math.random() * nearby.length)] : null;
    const x = target ? target.x : player.x + randRange(-100, 100);
    const y = target ? target.y : player.y + randRange(-100, 100);
    ab.extra.list.push({ x, y, age: 0, tickTimer: 0 });
  }
  for (let i = ab.extra.list.length - 1; i >= 0; i--) {
    const v = ab.extra.list[i];
    v.age += dt;
    v.tickTimer -= dt;
    if (v.age >= s.life) {
      ab.extra.list.splice(i, 1);
      continue;
    }
    if (v.tickTimer <= 0) {
      v.tickTimer = s.tick;
      for (const z of enemies) {
        if (dist(v.x, v.y, z.x, z.y) <= s.radius + z.radius) damageEnemy(z, s.dmg * dmgMul);
      }
    }
  }
}

function updateNova(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul, now) {
  const s = novaStats(ab.level);
  ab.timer -= dt;
  if (ab.timer <= 0) {
    ab.timer = s.interval * cdMul;
    ab.extra.pulseAt = now;
    ab.extra.radius = s.radius;
    for (const z of enemies) {
      if (dist(player.x, player.y, z.x, z.y) <= s.radius + z.radius) damageEnemy(z, s.dmg * dmgMul);
    }
    healPlayer(player, s.heal);
  }
}

function updateRicochet(ab, player, dt, enemies, damageEnemy, dmgMul, cdMul) {
  const s = ricochetStats(ab.level);
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
        bouncesLeft: s.bounces,
        hit: new Set(),
        life: 2.5,
      });
    }
  }
  for (let i = ab.extra.list.length - 1; i >= 0; i--) {
    const r = ab.extra.list[i];
    r.life -= dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    let removed = false;
    const target = enemies.find((e) => e.uid === r.targetUid);
    if (target && !r.hit.has(target.uid) && dist(r.x, r.y, target.x, target.y) <= target.radius + 6) {
      damageEnemy(target, s.dmg * dmgMul);
      r.hit.add(target.uid);
      if (r.bouncesLeft <= 0) {
        removed = true;
      } else {
        r.bouncesLeft -= 1;
        const next = enemies
          .filter((e) => !r.hit.has(e.uid) && dist(r.x, r.y, e.x, e.y) <= s.range)
          .sort((a, b) => dist(r.x, r.y, a.x, a.y) - dist(r.x, r.y, b.x, b.y))[0];
        if (next) {
          const a = angleTo(r.x, r.y, next.x, next.y);
          r.vx = Math.cos(a) * s.speed;
          r.vy = Math.sin(a) * s.speed;
          r.targetUid = next.uid;
        } else {
          removed = true;
        }
      }
    }
    if (removed || r.life <= 0) ab.extra.list.splice(i, 1);
  }
}

function updateShield(ab, player, dt, cdMul) {
  const s = shieldStats(ab.level);
  ab.timer -= dt;
  if (ab.timer <= 0) {
    ab.timer = s.interval * cdMul;
    player.shieldHp = Math.max(player.shieldHp, s.amount);
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
    case "guardianDrone":
      return droneStats(level);
    case "frostTrail":
      return frostStats(level);
    case "magnetPulse":
      return magnetStats(level);
    case "swarmBots":
      return swarmStats(level);
    case "boomerangBlade":
      return boomerangStats(level);
    case "throwingKnives":
      return knivesStats(level);
    case "fireVolcano":
      return volcanoStats(level);
    case "holyNova":
      return novaStats(level);
    case "ricochetRound":
      return ricochetStats(level);
    case "guardianShield":
      return shieldStats(level);
    default:
      return {};
  }
}
