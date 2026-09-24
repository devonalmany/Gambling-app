// Selectable maps: picked on the loadout screen before a run starts. Each
// one re-skins the procedurally painted ground (see buildGroundTexture in
// main.js) and can carry a real gameplay modifier — a currency/XP bonus,
// permanent fog, or a field of environmental hazards.
//
// Hazard positions are given as fractions of the arena (0-1) so they scale
// to any viewport; main.js converts them to pixel coordinates once at the
// start of a run.

export const MAP_DEFS = [
  {
    id: "compound",
    name: "Wasteland Compound",
    icon: "⛶",
    tagline: "The standard killing floor. No tricks, no bonuses.",
    modifierLabel: "No modifiers — balanced ground",
    palette: {
      base: ["#182015", "#121a10", "#0a0f08"],
      patchTones: ["#2c3a22", "#241c16", "#1a2418", "#33291a"],
      crackAlpha: 0.35,
      crackDensityMul: 1,
    },
    modifiers: { currencyMul: 1, xpMul: 1, fogAlways: false },
    hazards: [],
  },
  {
    id: "suburbia",
    name: "Suburbia Ruins",
    icon: "⌂",
    tagline: "Cracked driveways and dead lawns. Rich pickings.",
    modifierLabel: "+10% Currency Gain",
    palette: {
      base: ["#2a2718", "#211f14", "#16150d"],
      patchTones: ["#4a4a28", "#3a3320", "#57502e", "#2e2a1a"],
      crackAlpha: 0.4,
      crackDensityMul: 1.3,
    },
    modifiers: { currencyMul: 1.1, xpMul: 1, fogAlways: false },
    hazards: [],
  },
  {
    id: "boneyard",
    name: "The Boneyard",
    icon: "✝",
    tagline: "Permanent fog. Every zombie earns its keep — literally.",
    modifierLabel: "Fog from Wave 1 · +15% XP Gain",
    palette: {
      base: ["#161c1a", "#0f1412", "#090c0b"],
      patchTones: ["#3a3a3a", "#2a2a2a", "#454034", "#1f2320"],
      crackAlpha: 0.45,
      crackDensityMul: 1.6,
    },
    modifiers: { currencyMul: 1, xpMul: 1.15, fogAlways: true },
    hazards: [],
  },
  {
    id: "foundry",
    name: "The Foundry",
    icon: "▲",
    tagline: "Scrap-rich, but the steam vents don't care whose side you're on.",
    modifierLabel: "+15% Currency Gain · Steam vent hazards",
    palette: {
      base: ["#241a12", "#1a130d", "#0f0b08"],
      patchTones: ["#4a2a1a", "#3a2418", "#5c3320", "#2e2018"],
      crackAlpha: 0.4,
      crackDensityMul: 1,
    },
    modifiers: { currencyMul: 1.15, xpMul: 1, fogAlways: false },
    hazards: [
      { fx: 0.25, fy: 0.3, radius: 55, damage: 14, cycle: 4.2 },
      { fx: 0.72, fy: 0.62, radius: 55, damage: 14, cycle: 4.6 },
      { fx: 0.45, fy: 0.8, radius: 50, damage: 12, cycle: 3.8 },
    ],
  },
];

export function getMap(id) {
  return MAP_DEFS.find((m) => m.id === id) ?? MAP_DEFS[0];
}
