// Static game data: status tiers, home tiers, shop catalogs, opponents, achievements.

export const STATUS_TIERS = [
  { id: 'homeless', name: 'Homeless', min: 0, max: 500,
    desc: 'Sleeping on a bench outside the casino. Every dollar counts.' },
  { id: 'grinder', name: 'Grinder', min: 500, max: 5000,
    desc: 'You’ve got a roof and a bankroll. Time to grind up the stakes.' },
  { id: 'regular', name: 'Regular', min: 5000, max: 50000,
    desc: 'The pit bosses know your name. Mid-stakes rooms are open.' },
  { id: 'highroller', name: 'High Roller', min: 50000, max: 500000,
    desc: 'Custom suits, penthouse views, high-stakes everything.' },
  { id: 'whale', name: 'Whale', min: 500000, max: 5000000,
    desc: 'Nosebleed tables and a VIP host on speed dial.' },
  { id: 'owner', name: 'Casino Owner', min: 5000000, max: Infinity,
    desc: 'You don’t play the house anymore — you are the house.' },
];

export function tierForNetWorth(nw) {
  return STATUS_TIERS.find(t => nw >= t.min && nw < t.max) || STATUS_TIERS[STATUS_TIERS.length - 1];
}
export function tierIndex(id) { return STATUS_TIERS.findIndex(t => t.id === id); }

// ---------------------------------------------------------------- Home shop
export const HOME_TIERS = [
  { id: 'bench', name: 'Park Bench', icon: '🫑', price: 0, reqTier: 'homeless',
    perk: 'None — rock bottom.', dailyBonus: 0 },
  { id: 'shelter', name: 'Shelter Cot', icon: '🛏️', price: 150, reqTier: 'homeless',
    perk: '+$2/day login bonus', dailyBonus: 2 },
  { id: 'studio', name: 'Rented Studio', icon: '🏠', price: 1200, reqTier: 'grinder',
    perk: '+$10/day login bonus', dailyBonus: 10 },
  { id: 'onebed', name: 'One-Bedroom Downtown', icon: '🏢', price: 6000, reqTier: 'grinder',
    perk: '+$30/day, +1 teammate slot', dailyBonus: 30 },
  { id: 'condo', name: 'Condo on the Strip', icon: '🏙️', price: 25000, reqTier: 'regular',
    perk: '+$90/day, +1 teammate slot', dailyBonus: 90 },
  { id: 'suburban', name: 'Suburban House', icon: '🏡', price: 100000, reqTier: 'regular',
    perk: '+$250/day, host private games (+5% payouts)', dailyBonus: 250, hostBonus: 0.05 },
  { id: 'penthouse', name: 'Luxury Penthouse', icon: '🏙️✨', price: 500000, reqTier: 'highroller',
    perk: '+$700/day, +2 teammate slots, +8% payouts', dailyBonus: 700, hostBonus: 0.08 },
  { id: 'mansion', name: 'Private Mansion', icon: '🏰', price: 2000000, reqTier: 'whale',
    perk: '+$2,000/day, +10% payouts', dailyBonus: 2000, hostBonus: 0.10 },
  { id: 'casino', name: 'Your Own Casino', icon: '🎰', price: 8000000, reqTier: 'owner',
    perk: '+$6,000/day, +15% payouts, prestige floor', dailyBonus: 6000, hostBonus: 0.15 },
];

// ------------------------------------------------------------- Personal shop
// currency: 'cash' or 'style'
export const PERSONAL_SHOP_ITEMS = [
  // Outfits
  { id: 'outfit_hoodie', slot: 'outfit', name: 'Worn Hoodie', icon: '🧥', price: 0, currency: 'cash', reqTier: 'homeless', tag: 'default' },
  { id: 'outfit_street', slot: 'outfit', name: 'Streetwear Set', icon: '👕', price: 40, currency: 'cash', reqTier: 'homeless' },
  { id: 'outfit_casual', slot: 'outfit', name: 'Business Casual', icon: '🧥', price: 400, currency: 'cash', reqTier: 'grinder' },
  { id: 'outfit_suit', slot: 'outfit', name: 'Tailored Suit', icon: '🥵', price: 4000, currency: 'cash', reqTier: 'regular', bonus: { tellResist: 0.05 } },
  { id: 'outfit_tux', slot: 'outfit', name: 'Black-Tie Tuxedo', icon: '🎗️', price: 40000, currency: 'cash', reqTier: 'highroller', bonus: { tellResist: 0.10 } },
  { id: 'outfit_whale', slot: 'outfit', name: 'Gold Thread Whale Fit', icon: '👑', price: 400000, currency: 'cash', reqTier: 'whale', bonus: { tellResist: 0.18, confidence: 0.1 } },

  // Watches & jewelry
  { id: 'jewel_none', slot: 'jewelry', name: 'Bare Wrist', icon: '➖', price: 0, currency: 'cash', reqTier: 'homeless', tag: 'default' },
  { id: 'jewel_chain', slot: 'jewelry', name: 'Silver Chain', icon: '⛓️', price: 60, currency: 'style', reqTier: 'homeless' },
  { id: 'jewel_watch', slot: 'jewelry', name: 'Sport Watch', icon: '⌚', price: 300, currency: 'style', reqTier: 'grinder' },
  { id: 'jewel_gold', slot: 'jewelry', name: 'Gold Chain & Ring', icon: '📿', price: 1200, currency: 'style', reqTier: 'regular', bonus: { confidence: 0.05 } },
  { id: 'jewel_rolex', slot: 'jewelry', name: 'Diamond Rolex', icon: '💎', price: 6000, currency: 'style', reqTier: 'highroller', bonus: { confidence: 0.1, tellResist: 0.05 } },
  { id: 'jewel_iced', slot: 'jewelry', name: 'Fully Iced Out', icon: '✨', price: 20000, currency: 'style', reqTier: 'whale', bonus: { confidence: 0.2, tellResist: 0.1 } },

  // Hair / face
  { id: 'hair_default', slot: 'hair', name: 'Default Cut', icon: '👤', price: 0, currency: 'cash', reqTier: 'homeless', tag: 'default' },
  { id: 'hair_fade', slot: 'hair', name: 'Clean Fade', icon: '💇', price: 80, currency: 'style', reqTier: 'homeless' },
  { id: 'hair_beard', slot: 'hair', name: 'Groomed Beard', icon: '🧔', price: 250, currency: 'style', reqTier: 'grinder' },
  { id: 'hair_shades', slot: 'hair', name: 'Poker Shades', icon: '🕶️', price: 900, currency: 'style', reqTier: 'regular', bonus: { tellResist: 0.08 } },
  { id: 'hair_cigar', slot: 'hair', name: 'Signature Cigar', icon: '🚬', price: 3500, currency: 'style', reqTier: 'highroller', bonus: { confidence: 0.05 } },

  // Emotes
  { id: 'emote_fistpump', slot: 'emote', name: 'Fist Pump', icon: '👊', price: 100, currency: 'style', reqTier: 'homeless' },
  { id: 'emote_chipflip', slot: 'emote', name: 'Chip Flip Trick', icon: '🪙', price: 500, currency: 'style', reqTier: 'grinder' },
  { id: 'emote_cigarlight', slot: 'emote', name: 'Light the Cigar', icon: '🔥', price: 2500, currency: 'style', reqTier: 'regular' },
];

export const TEAMMATES = [
  { id: 'counter', name: 'Ada "Cardcount" Lin', icon: '🧮', role: 'Card Counter',
    price: 1500, currency: 'style', reqTier: 'grinder', desc: 'Nudges blackjack decision hints toward optimal play.' },
  { id: 'shark_reader', name: 'Miko "The Read" Osei', icon: '🐟', role: 'Poker Shark',
    price: 3000, currency: 'style', reqTier: 'regular', desc: 'Gives a post-hand tip on your biggest leak.' },
  { id: 'lucky', name: 'Charm', icon: '🍀', role: 'Lucky Charm',
    price: 5000, currency: 'style', reqTier: 'regular', desc: 'A small cosmetic sparkle effect on slot wins, +1% near-miss flair (visual only).' },
];

// ------------------------------------------------------------------- Poker
export const POKER_ROOMS = [
  { id: 'micro', name: 'Micro Stakes', sb: 1, bb: 2, reqTier: 'homeless',
    opponent: { name: 'Big Sal', icon: '🍔', style: 'Calling Station', tight: 0.25, aggro: 0.15, bluff: 0.05 } },
  { id: 'low', name: 'Low Stakes', sb: 5, bb: 10, reqTier: 'grinder',
    opponent: { name: 'The Accountant', icon: '🧮', style: 'Tight-Aggressive', tight: 0.65, aggro: 0.5, bluff: 0.1 } },
  { id: 'mid', name: 'Mid Stakes', sb: 25, bb: 50, reqTier: 'regular',
    opponent: { name: 'Wildcat', icon: '🐈', style: 'Loose-Aggressive', tight: 0.2, aggro: 0.75, bluff: 0.35 } },
  { id: 'high', name: 'High Stakes', sb: 100, bb: 200, reqTier: 'highroller',
    opponent: { name: 'The Magician', icon: '🎩', style: 'Bluff-Heavy', tight: 0.35, aggro: 0.6, bluff: 0.5 } },
  { id: 'nosebleed', name: 'Nosebleed (Invite Only)', sb: 500, bb: 1000, reqTier: 'whale',
    opponent: { name: 'The Shark', icon: '🦈', style: 'Adaptive Nemesis', tight: 0.5, aggro: 0.55, bluff: 0.25, adaptive: true } },
];

// ------------------------------------------------------------------ Blackjack
export const BLACKJACK_TABLES = [
  { id: 'penny', name: 'Penny Lane', min: 1, max: 5, reqTier: 'homeless' },
  { id: 'low', name: 'Low Roller', min: 5, max: 25, reqTier: 'grinder' },
  { id: 'mid', name: 'Mid Stakes', min: 25, max: 150, reqTier: 'regular' },
  { id: 'high', name: 'High Stakes', min: 150, max: 1000, reqTier: 'highroller', surrender: true },
  { id: 'vip', name: 'VIP Salon', min: 1000, max: 10000, reqTier: 'whale', surrender: true },
];

// ------------------------------------------------------------------ Roulette
export const ROULETTE_TABLES = [
  { id: 'penny', name: 'Penny Lane', min: 1, max: 20, reqTier: 'homeless' },
  { id: 'low', name: 'Low Roller', min: 5, max: 100, reqTier: 'grinder' },
  { id: 'mid', name: 'Mid Stakes', min: 25, max: 500, reqTier: 'regular' },
  { id: 'high', name: 'High Stakes', min: 100, max: 5000, reqTier: 'highroller' },
];

// --------------------------------------------------------------------- Slots
export const SLOT_MACHINES = [
  { id: 'classic', name: 'Classic Fruit', icon: '🍒', reqTier: 'homeless', variance: 'low',
    symbols: ['🍒', '🍋', '🍊', '🄿️', '⭐', '7️⃣'],
    weights: [30, 26, 22, 14, 6, 2],
    pays: { '🍒': [0, 0, 2, 6], '🍋': [0, 0, 2, 8], '🍊': [0, 0, 3, 10],
      '🄿️': [0, 0, 5, 15], '⭐': [0, 1, 8, 25], '7️⃣': [0, 2, 20, 100] },
    wild: '⭐', scatter: '🄿️' },
  { id: 'egypt', name: 'Pharaoh’s Fortune', icon: '🐫', reqTier: 'grinder', variance: 'medium',
    symbols: ['🐫', '🐍', '⛱️', '💁', '👁️', '👑'],
    weights: [28, 24, 20, 16, 8, 4],
    pays: { '🐫': [0, 0, 3, 8], '🐍': [0, 0, 3, 10], '⛱️': [0, 0, 4, 12],
      '💁': [0, 0, 6, 18], '👁️': [0, 1, 10, 35], '👑': [0, 3, 30, 150] },
    wild: '👁️', scatter: '⛱️' },
  { id: 'pirate', name: 'Pirate’s Plunder', icon: '🏴‍☠️', reqTier: 'regular', variance: 'medium',
    symbols: ['⚓', '💎', '🗺️', '🦜', '💀', '🧭'],
    weights: [26, 22, 20, 18, 10, 4],
    pays: { '⚓': [0, 0, 3, 9], '💎': [0, 0, 4, 12], '🗺️': [0, 0, 5, 15],
      '🦜': [0, 0, 6, 20], '💀': [0, 1, 12, 40], '🧭': [0, 3, 35, 175] },
    wild: '💀', scatter: '🗺️' },
  { id: 'cyber', name: 'Neon Cyberpunk', icon: '🤖', reqTier: 'highroller', variance: 'high',
    symbols: ['🔌', '💾', '🖥️', '👾', '⚡', '🤖'],
    weights: [26, 22, 18, 16, 12, 6],
    pays: { '🔌': [0, 0, 3, 10], '💾': [0, 0, 4, 14], '🖥️': [0, 0, 6, 20],
      '👾': [0, 0, 8, 28], '⚡': [0, 2, 16, 55], '🤖': [0, 5, 50, 250] },
    wild: '⚡', scatter: '👾' },
  { id: 'myth', name: 'Mount Olympus', icon: '⚡', reqTier: 'whale', variance: 'high',
    symbols: ['🏛️', '🔱', '🦅', '🌊', '⚡', '⚡👑'],
    weights: [24, 22, 18, 16, 12, 8],
    pays: { '🏛️': [0, 0, 4, 12], '🔱': [0, 0, 5, 16], '🦅': [0, 0, 7, 24],
      '🌊': [0, 1, 10, 32], '⚡': [0, 3, 20, 70], '⚡👑': [0, 6, 60, 300] },
    wild: '⚡', scatter: '🌊' },
];
// pays[symbol] = payout multiplier for [1,2,3,4,5]-in-a-row match count index (index 0 unused-ish, we use count-1)

// ---------------------------------------------------------------- Achievements
// `reward` is a one-time cash bonus paid out the moment the achievement unlocks.
export const ACHIEVEMENTS = [
  { id: 'first_win', name: 'First Blood', icon: '🎉', desc: 'Win your first bet of any kind.', reward: 10 },
  { id: 'first_blackjack', name: 'Natural!', icon: '🃏', desc: 'Hit your first blackjack.', reward: 25 },
  { id: 'royal_flush', name: 'Royal Flush', icon: '👑', desc: 'Win a hand with a royal flush.', reward: 500 },
  { id: 'jackpot', name: 'Jackpot!', icon: '💰', desc: 'Hit a progressive jackpot on the slots.', reward: 0 },
  { id: 'grinder_tier', name: 'Off The Bench', icon: '📈', desc: 'Reach Grinder status.', reward: 50 },
  { id: 'regular_tier', name: 'Regular', icon: '🍻', desc: 'Reach Regular status.', reward: 250 },
  { id: 'highroller_tier', name: 'High Roller', icon: '💎', desc: 'Reach High Roller status.', reward: 1000 },
  { id: 'whale_tier', name: 'Whale', icon: '🐳', desc: 'Reach Whale status.', reward: 5000 },
  { id: 'owner_tier', name: 'The House Always Wins', icon: '🎰', desc: 'Become the Casino Owner.', reward: 25000 },
  { id: 'survive_100', name: 'Grinder’s Resolve', icon: '⏳', desc: 'Play 100 hands/spins without going bankrupt.', reward: 100 },
  { id: 'first_bankruptcy', name: 'Rock Bottom', icon: '🔻', desc: 'Go bankrupt for the first time (it happens to everyone).', reward: 0 },
  { id: 'comeback', name: 'The Comeback', icon: '🔥', desc: 'Reach Regular status again after a bankruptcy.', reward: 200 },
  { id: 'own_a_home', name: 'Keys In Hand', icon: '🗝️', desc: 'Buy your first home upgrade.', reward: 25 },
  { id: 'penthouse', name: 'Penthouse Views', icon: '🌆', desc: 'Move into the Luxury Penthouse.', reward: 1000 },
  { id: 'shark_beat', name: 'Shark Bait No More', icon: '🦈', desc: 'Beat The Shark in a Nosebleed hand.', reward: 500 },
];

export const CASH_MIN_BET_FLOOR = 1; // absolute lowest bet in the game

// ------------------------------------------------------------- Quick cash
// Two no-risk ways to top up outside of gambling: a short-cooldown "hustle"
// for when you're broke and need bet money fast, and a slower, bigger
// "free chips" claim. Both scale with status tier so they stay useful (but
// never game-breaking) as you climb.
export const HUSTLE_COOLDOWN_MS = 20 * 1000; // 20 seconds
export const FREE_CHIPS_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

export const HUSTLE_REWARDS = {
  homeless: 3, grinder: 20, regular: 90, highroller: 450, whale: 2500, owner: 12000,
};
export const FREE_CHIPS_REWARDS = {
  homeless: 12, grinder: 80, regular: 400, highroller: 2000, whale: 10000, owner: 50000,
};
