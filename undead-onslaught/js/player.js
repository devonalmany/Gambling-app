import { PLAYER, XP } from "./constants.js";
import { clamp } from "./utils.js";
import { WEAPON_ORDER, WEAPON_DEFS, emptyUpgrades } from "./weapons.js";
import { getCharacter } from "./characters.js";

export function createPlayer(canvasW, canvasH, characterId = "rookie") {
  const character = getCharacter(characterId);
  const mods = character.statMods;
  const weapons = {};
  for (const id of WEAPON_ORDER) {
    const def = WEAPON_DEFS[id];
    weapons[id] = {
      unlocked: id === "pistol",
      ammoInMag: def.magSize ?? 0,
      ammoReserve: def.infiniteAmmo ? Infinity : Math.round((def.reserveMax ?? 0) * 0.6),
      reloading: false,
      reloadTimer: 0,
      fireTimer: 0,
      holdTime: 0, // for minigun spin-up / flamethrower continuous fire
      upgrades: emptyUpgrades(),
    };
  }

  const maxHp = PLAYER.maxHp + (mods.maxHpBonus ?? 0);

  return {
    x: canvasW / 2,
    y: canvasH / 2,
    radius: PLAYER.radius,
    facing: 0,
    hp: maxHp,
    maxHp,
    characterId: character.id,
    characterColor: { primary: character.colorPrimary, secondary: character.colorSecondary, accent: character.accent },
    invulnMs: 0,
    dashCooldownLeft: 0,
    dashing: false,
    dashTimeLeft: 0,
    dashDirX: 0,
    dashDirY: 0,
    meleeCooldownLeft: 0,
    meleeSwingT: 0,

    level: 1,
    xp: 0,
    xpToNext: Math.round(XP.base),
    currency: 0,
    kills: 0,
    damageTakenThisWave: false,

    currentWeapon: "pistol",
    weapons,

    abilities: [], // { id, level }
    abilitySlots: PLAYER.baseAbilitySlots,

    perks: {
      maxHpBonus: 0,
      moveSpeedMul: 1 + (mods.moveSpeedMul ?? 0),
      dashCooldownMul: 1 + (mods.dashCooldownMul ?? 0),
      currencyGainMul: 1 + (mods.currencyGainMul ?? 0),
      regenBonus: 0,
      pickupRadiusBonus: mods.pickupRadiusBonus ?? 0,
      abilityDamageMul: 1 + (mods.abilityDamageMul ?? 0),
      cooldownReductionMul: 1 + (mods.cooldownReductionMul ?? 0),
      xpGainMul: 1 + (mods.xpGainMul ?? 0),
      extraAmmoMul: 1,
      meleeDamageMul: 1 + (mods.meleeDamageMul ?? 0),
      weaponDamageMul: 1 + (mods.weaponDamageMul ?? 0),
    },
    shopLevels: {},
    autoAim: false,
    autoFire: false,
  };
}

export function xpForLevel(level) {
  return Math.round(XP.base * Math.pow(XP.growth, level - 1));
}

export function damagePlayer(player, amount) {
  if (player.invulnMs > 0 || player.dashing) return false;
  player.hp = clamp(player.hp - amount, 0, player.maxHp);
  player.invulnMs = PLAYER.hitInvulnMs;
  player.damageTakenThisWave = true;
  return true;
}

export function healPlayer(player, amount) {
  player.hp = clamp(player.hp + amount, 0, player.maxHp);
}

export function grantXp(player, amount) {
  player.xp += amount * player.perks.xpGainMul;
  const leveled = [];
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = xpForLevel(player.level);
    leveled.push(player.level);
  }
  return leveled;
}

export function grantCurrency(player, amount) {
  player.currency += Math.round(amount * player.perks.currencyGainMul);
}

export function updatePlayer(player, dt, input, moveVec, bounds) {
  if (player.invulnMs > 0) player.invulnMs = Math.max(0, player.invulnMs - dt * 1000);
  if (player.meleeCooldownLeft > 0) player.meleeCooldownLeft -= dt;
  if (player.meleeSwingT > 0) player.meleeSwingT = Math.max(0, player.meleeSwingT - dt * 3.2);

  // Dash
  if (player.dashing) {
    player.dashTimeLeft -= dt;
    const speed = PLAYER.dashSpeed;
    player.x += player.dashDirX * speed * dt;
    player.y += player.dashDirY * speed * dt;
    if (player.dashTimeLeft <= 0) player.dashing = false;
  } else {
    const speed = PLAYER.speed * player.perks.moveSpeedMul;
    player.x += moveVec.x * speed * dt;
    player.y += moveVec.y * speed * dt;
  }
  if (player.dashCooldownLeft > 0) player.dashCooldownLeft -= dt;

  player.x = clamp(player.x, player.radius, bounds.w - player.radius);
  player.y = clamp(player.y, player.radius, bounds.h - player.radius);

  // Passive regen
  const regen = PLAYER.regenPerSec + player.perks.regenBonus;
  if (regen > 0 && player.hp < player.maxHp) {
    player.hp = clamp(player.hp + regen * dt, 0, player.maxHp);
  }

}

export function tryDash(player, moveVec) {
  if (player.dashCooldownLeft > 0 || player.dashing) return false;
  const dx = moveVec.moving ? moveVec.x : Math.cos(player.facing);
  const dy = moveVec.moving ? moveVec.y : Math.sin(player.facing);
  player.dashing = true;
  player.dashTimeLeft = PLAYER.dashDuration;
  player.dashDirX = dx;
  player.dashDirY = dy;
  player.dashCooldownLeft = PLAYER.dashCooldown * player.perks.dashCooldownMul;
  player.invulnMs = Math.max(player.invulnMs, PLAYER.dashDuration * 1000 + 80);
  return true;
}

export function pickupRadius(player) {
  return PLAYER.pickupRadius + player.perks.pickupRadiusBonus;
}
