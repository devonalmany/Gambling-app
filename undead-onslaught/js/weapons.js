// Weapon definitions + upgrade-track math. Every weapon has infinite ammo —
// firing is gated only by its fire-rate cooldown (see main.js updateWeapon).

export const UPGRADE_TRACKS = [
  { id: "dmg", label: "Damage", max: 5 },
  { id: "fireRate", label: "Fire Rate", max: 5 },
  { id: "crit", label: "Crit Chance", max: 5 },
  { id: "pierce", label: "Piercing", max: 3 },
  { id: "explosive", label: "Explosive Rounds", max: 3 },
  { id: "range", label: "Extended Range", max: 5 }, // Flamethrower only
];

// mode: "projectile" (bullets), "cone" (continuous tick damage, flamethrower),
// "lob" (arcing AOE grenade), "beam" (instant piercing hitscan, railgun)
export const WEAPON_DEFS = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    key: "Digit1",
    unlockCost: 0,
    mode: "projectile",
    damage: 9,
    fireRate: 3.2,
    bulletSpeed: 640,
    spreadDeg: 2,
    pellets: 1,
    critChance: 0.05,
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    key: "Digit2",
    unlockCost: 60,
    mode: "projectile",
    damage: 7,
    pellets: 6,
    fireRate: 1.1,
    bulletSpeed: 560,
    spreadDeg: 18,
    critChance: 0.03,
  },
  smg: {
    id: "smg",
    name: "SMG",
    key: "Digit3",
    unlockCost: 80,
    mode: "projectile",
    damage: 4.5,
    pellets: 1,
    fireRate: 9,
    bulletSpeed: 700,
    spreadDeg: 7,
    critChance: 0.05,
  },
  rifle: {
    id: "rifle",
    name: "Assault Rifle",
    key: "Digit4",
    unlockCost: 110,
    mode: "projectile",
    damage: 12,
    pellets: 1,
    fireRate: 5.5,
    bulletSpeed: 760,
    spreadDeg: 3,
    critChance: 0.08,
  },
  sniper: {
    id: "sniper",
    name: "Sniper Rifle",
    key: "Digit5",
    unlockCost: 160,
    mode: "projectile",
    damage: 55,
    pellets: 1,
    fireRate: 0.9,
    bulletSpeed: 1100,
    spreadDeg: 0.5,
    critChance: 0.18,
  },
  flamethrower: {
    id: "flamethrower",
    name: "Flamethrower",
    key: "Digit6",
    unlockCost: 240,
    mode: "cone",
    damage: 16, // per tick, ticks ~6/sec while held
    fireRate: 6,
    range: 150,
    coneDeg: 40,
    critChance: 0.0,
  },
  grenadeLauncher: {
    id: "grenadeLauncher",
    name: "Grenade Launcher",
    key: "Digit7",
    unlockCost: 300,
    mode: "lob",
    damage: 60,
    pellets: 1,
    fireRate: 1.4,
    bulletSpeed: 480,
    spreadDeg: 2,
    explosionRadius: 90,
    critChance: 0.05,
  },
  minigun: {
    id: "minigun",
    name: "Minigun",
    key: "Digit8",
    unlockCost: 380,
    mode: "projectile",
    damage: 6,
    pellets: 1,
    fireRate: 14,
    bulletSpeed: 780,
    spreadDeg: 10, // tightens with spin-up, see main.js
    spreadDegSpunUp: 3,
    spinUpTime: 0.6,
    critChance: 0.05,
  },
  railgun: {
    id: "railgun",
    name: "Railgun",
    key: "Digit9",
    unlockCost: 450,
    mode: "beam", // instant piercing hitscan line, see main.js fireRailgun()
    damage: 65,
    fireRate: 0.8,
    range: 1400,
    beamWidth: 7,
    critChance: 0.15,
  },
};

export const WEAPON_ORDER = [
  "pistol",
  "shotgun",
  "smg",
  "rifle",
  "sniper",
  "flamethrower",
  "grenadeLauncher",
  "minigun",
  "railgun",
];

export function emptyUpgrades() {
  return { dmg: 0, fireRate: 0, crit: 0, pierce: 0, explosive: 0, range: 0 };
}

export function upgradeCost(track, currentLevel) {
  const base = { dmg: 20, fireRate: 22, crit: 24, pierce: 45, explosive: 55, range: 35 };
  return Math.round(base[track] * Math.pow(1.55, currentLevel));
}

// Combines static def + upgrade levels into the numbers actually used when
// firing this frame.
export function effectiveStats(def, upgrades) {
  const dmgMul = 1 + upgrades.dmg * 0.16;
  const fireRateMul = 1 + upgrades.fireRate * 0.12;
  return {
    damage: def.damage * dmgMul,
    fireRate: def.fireRate * fireRateMul,
    range: (def.range ?? 0) * (1 + upgrades.range * 0.15),
    critChance: Math.min(0.75, (def.critChance || 0) + upgrades.crit * 0.06),
    pierce: upgrades.pierce,
    explosive: upgrades.explosive > 0,
    explosionRadius: 30 + upgrades.explosive * 18,
    explosionDamageMul: 0.5,
  };
}
