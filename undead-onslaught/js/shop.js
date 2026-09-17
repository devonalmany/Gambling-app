// Between-wave shop: this-run currency spent on weapon upgrade tracks,
// weapon unlocks, and player perks. Everything here resets on a new run —
// see README "Known simplifications" for why there's no cross-run
// meta-currency layer.
import { WEAPON_ORDER, WEAPON_DEFS, UPGRADE_TRACKS, upgradeCost } from "./weapons.js";

export const SHOP_PERKS = [
  { id: "maxHp", name: "Max HP", desc: "+15 Max HP", costBase: 45, apply: (p) => { p.maxHp += 15; p.hp += 15; } },
  { id: "moveSpeed", name: "Move Speed", desc: "+6% Move Speed", costBase: 55, apply: (p) => { p.perks.moveSpeedMul += 0.06; } },
  { id: "dashCooldown", name: "Dash Cooldown", desc: "-10% Dash Cooldown", costBase: 50, apply: (p) => { p.perks.dashCooldownMul = Math.max(0.4, p.perks.dashCooldownMul - 0.1); } },
  { id: "currencyGain", name: "Currency Gain", desc: "+10% Currency Gain", costBase: 60, apply: (p) => { p.perks.currencyGainMul += 0.1; } },
  { id: "regen", name: "Health Regen", desc: "+0.4 HP/s Regen", costBase: 55, apply: (p) => { p.perks.regenBonus += 0.4; } },
  { id: "extraAmmo", name: "Extra Ammo", desc: "+15% Ammo Refill Between Waves", costBase: 40, apply: (p) => { p.perks.extraAmmoMul += 0.15; } },
];

export function perkCost(perk, level) {
  return Math.round(perk.costBase * Math.pow(1.5, level));
}

export function buyPerk(player, perkId) {
  const perk = SHOP_PERKS.find((p) => p.id === perkId);
  if (!perk) return false;
  const level = player.shopLevels[perkId] ?? 0;
  const cost = perkCost(perk, level);
  if (player.currency < cost) return false;
  player.currency -= cost;
  player.shopLevels[perkId] = level + 1;
  perk.apply(player);
  return true;
}

export function buyWeaponUnlock(player, weaponId) {
  const def = WEAPON_DEFS[weaponId];
  const w = player.weapons[weaponId];
  if (!def || !w || w.unlocked) return false;
  if (player.currency < def.unlockCost) return false;
  player.currency -= def.unlockCost;
  w.unlocked = true;
  return true;
}

export function buyWeaponUpgrade(player, weaponId, trackId) {
  const w = player.weapons[weaponId];
  const track = UPGRADE_TRACKS.find((t) => t.id === trackId);
  if (!w || !w.unlocked || !track) return false;
  const level = w.upgrades[trackId];
  if (level >= track.max) return false;
  const cost = upgradeCost(trackId, level);
  if (player.currency < cost) return false;
  player.currency -= cost;
  w.upgrades[trackId] = level + 1;
  return true;
}

// Refill a slice of reserve ammo for unlocked non-infinite weapons at the
// start of each wave (bigger with the Extra Ammo perk).
export function refillAmmoForWave(player) {
  for (const id of WEAPON_ORDER) {
    const def = WEAPON_DEFS[id];
    const w = player.weapons[id];
    if (!w.unlocked || def.infiniteAmmo) continue;
    const refill = Math.round(def.reserveMax * 0.22 * player.perks.extraAmmoMul);
    w.ammoReserve = Math.min(def.reserveMax, w.ammoReserve + refill);
  }
}

export function abilitySlotsLabel(player) {
  return `${player.abilities.length}/${player.abilitySlots}`;
}
