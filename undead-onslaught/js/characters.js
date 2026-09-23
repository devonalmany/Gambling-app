// Playable characters: picked on the loadout screen before a run starts.
// Each is a bundle of starting-stat deltas applied once in createPlayer(),
// plus a color scheme used to tint the player's body everywhere it's drawn.
// All four start with the same weapon (Pistol) and the same shop — the
// difference is entirely in how they move, hit, and scale.

export const CHARACTER_DEFS = [
  {
    id: "rookie",
    name: "The Rookie",
    icon: "★",
    tagline: "No edge, no weakness. Learn the game on easy mode.",
    colorPrimary: "#a8d4ff",
    colorSecondary: "#3172c4",
    accent: "#4ea1ff",
    passives: ["Balanced in every stat", "+5% XP gain — quick learner"],
    statMods: {
      xpGainMul: 0.05,
    },
  },
  {
    id: "brawler",
    name: "The Brawler",
    icon: "◆",
    tagline: "Built like a door. Hits like a truck. Not big on running.",
    colorPrimary: "#ffb199",
    colorSecondary: "#b8341a",
    accent: "#ff6b4a",
    passives: ["+25 Max HP", "+50% Melee damage", "-8% Move speed", "+10% Faster dash cooldown"],
    statMods: {
      maxHpBonus: 25,
      moveSpeedMul: -0.08,
      meleeDamageMul: 0.5,
      dashCooldownMul: -0.1,
    },
  },
  {
    id: "scout",
    name: "The Scout",
    icon: "▲",
    tagline: "Never the strongest in the room. Never has to be.",
    colorPrimary: "#a6fff0",
    colorSecondary: "#1a8a72",
    accent: "#5cf0d0",
    passives: ["+18% Move speed", "-18% Dash cooldown", "-15 Max HP"],
    statMods: {
      maxHpBonus: -15,
      moveSpeedMul: 0.18,
      dashCooldownMul: -0.18,
    },
  },
  {
    id: "technician",
    name: "The Technician",
    icon: "●",
    tagline: "Let the gadgets do the killing.",
    colorPrimary: "#e2c2ff",
    colorSecondary: "#6d28a8",
    accent: "#c084fc",
    passives: ["+30% Ability damage", "+18% Faster ability cooldowns", "-12% Weapon damage"],
    statMods: {
      abilityDamageMul: 0.3,
      cooldownReductionMul: -0.18,
      weaponDamageMul: -0.12,
    },
  },
];

export function getCharacter(id) {
  return CHARACTER_DEFS.find((c) => c.id === id) ?? CHARACTER_DEFS[0];
}
