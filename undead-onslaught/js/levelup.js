import { PLAYER } from "./constants.js";
import { ABILITY_DEFS, ABILITY_IDS, newAbilityState } from "./abilities.js";

export const PASSIVE_CARDS = [
  { id: "maxHp", name: "Vitality", desc: "+20 Max HP (fully healed)", apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  { id: "moveSpeed", name: "Fleet Foot", desc: "+8% Move Speed", apply: (p) => { p.perks.moveSpeedMul += 0.08; } },
  { id: "pickupRadius", name: "Magnetic Aura", desc: "+25 Pickup Radius", apply: (p) => { p.perks.pickupRadiusBonus += 25; } },
  { id: "xpGain", name: "Quick Study", desc: "+15% XP Gain", apply: (p) => { p.perks.xpGainMul += 0.15; } },
  { id: "currencyGain", name: "Scavenger", desc: "+15% Currency Gain", apply: (p) => { p.perks.currencyGainMul += 0.15; } },
  { id: "abilityDamage", name: "Overcharge", desc: "+15% Ability Damage", apply: (p) => { p.perks.abilityDamageMul += 0.15; } },
  { id: "cooldown", name: "Adrenaline", desc: "+12% Faster Ability Cooldowns", apply: (p) => { p.perks.cooldownReductionMul = Math.max(0.4, p.perks.cooldownReductionMul - 0.12); } },
  { id: "regen", name: "Second Wind", desc: "+0.6 HP/s Regen", apply: (p) => { p.perks.regenBonus += 0.6; } },
  { id: "dashCooldown", name: "Light Feet", desc: "-15% Dash Cooldown", apply: (p) => { p.perks.dashCooldownMul = Math.max(0.4, p.perks.dashCooldownMul - 0.15); } },
];

const SLOT_CARD = {
  id: "abilitySlot",
  name: "Extra Harness Slot",
  desc: "+1 Ability Slot",
  apply: (p) => { p.abilitySlots = Math.min(PLAYER.maxAbilitySlots, p.abilitySlots + 1); },
};

function buildPool(player, { abilitiesOnly = false } = {}) {
  const pool = [];
  const hasFreeSlot = player.abilities.length < player.abilitySlots;

  if (hasFreeSlot) {
    for (const id of ABILITY_IDS) {
      if (player.abilities.some((a) => a.id === id)) continue;
      pool.push({
        type: "newAbility",
        id,
        weight: 10,
        title: ABILITY_DEFS[id].name,
        icon: ABILITY_DEFS[id].icon,
        color: ABILITY_DEFS[id].color,
        desc: `NEW — ${ABILITY_DEFS[id].desc(1)}`,
      });
    }
  }

  for (const ab of player.abilities) {
    if (ab.level >= ABILITY_DEFS[ab.id].maxLevel) continue;
    pool.push({
      type: "upgradeAbility",
      id: ab.id,
      weight: 8,
      title: `${ABILITY_DEFS[ab.id].name} Lv.${ab.level + 1}`,
      icon: ABILITY_DEFS[ab.id].icon,
      color: ABILITY_DEFS[ab.id].color,
      desc: ABILITY_DEFS[ab.id].desc(ab.level + 1),
    });
  }

  if (!abilitiesOnly) {
    for (const card of PASSIVE_CARDS) {
      pool.push({ type: "passive", id: card.id, weight: 5, title: card.name, icon: "▲", color: "#9ca3af", desc: card.desc });
    }
    if (player.abilitySlots < PLAYER.maxAbilitySlots) {
      pool.push({ type: "passive", id: SLOT_CARD.id, weight: 1.5, title: SLOT_CARD.name, icon: "▣", color: "#f472b6", desc: SLOT_CARD.desc });
    }
  }

  return pool;
}

export function generateLevelUpCards(player, opts = {}) {
  const pool = buildPool(player, opts);
  if (!pool.length) return [];
  // Weighted-ish sample without replacement, favoring higher weight.
  const expanded = [];
  for (const item of pool) {
    const copies = Math.max(1, Math.round(item.weight));
    for (let i = 0; i < copies; i++) expanded.push(item);
  }
  const seen = new Set();
  const picks = [];
  let guard = 0;
  while (picks.length < Math.min(3, pool.length) && guard < 500) {
    guard += 1;
    const candidate = expanded[Math.floor(Math.random() * expanded.length)];
    const key = `${candidate.type}:${candidate.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(candidate);
  }
  return picks;
}

export function applyCard(player, card) {
  if (card.type === "newAbility") {
    player.abilities.push(newAbilityState(card.id));
  } else if (card.type === "upgradeAbility") {
    const ab = player.abilities.find((a) => a.id === card.id);
    if (ab) ab.level = Math.min(ABILITY_DEFS[card.id].maxLevel, ab.level + 1);
  } else if (card.type === "passive") {
    const passive = card.id === SLOT_CARD.id ? SLOT_CARD : PASSIVE_CARDS.find((c) => c.id === card.id);
    if (passive) passive.apply(player);
  }
}
