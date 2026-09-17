// Tunable numbers in one place so balance passes don't require hunting
// through every module.

export const PLAYER = {
  radius: 14,
  maxHp: 100,
  regenPerSec: 0.5,
  speed: 210,
  dashSpeed: 620,
  dashDuration: 0.18,
  dashCooldown: 2.4,
  hitInvulnMs: 500,
  pickupRadius: 60,
  meleeRange: 46,
  meleeArc: (100 * Math.PI) / 180,
  meleeDamage: 14,
  meleeCooldown: 0.45,
  meleeKnockback: 260,
  baseAbilitySlots: 4,
  maxAbilitySlots: 6,
};

export const XP = {
  // xp required to reach level N+1 from level N
  base: 12,
  growth: 1.16,
};

export const WAVE = {
  baseZombies: 8,
  perWaveGrowth: 4,
  maxAlive: 46,
  spawnIntervalStart: 0.9,
  spawnIntervalMin: 0.18,
  bossEvery: 5,
  clearBonus: 40,
  noDamageBonus: 25,
};

export const ARENA_MARGIN = 24;
