// ---------------------------------------------------------------------------
// GROUND UP — static game data: stats, locations, gigs, careers, housing,
// shop goods, status tiers, achievements, random events.
// ---------------------------------------------------------------------------

export const BLOCKS = ['Morning', 'Afternoon', 'Evening', 'Night'];

export const STATS = [
  { id: 'strength', name: 'Strength', icon: '💪', desc: 'Manual labor & moving power.' },
  { id: 'charisma', name: 'Charisma', icon: '🗣️', desc: 'Sales, negotiation, stage presence.' },
  { id: 'intelligence', name: 'Intelligence', icon: '📚', desc: 'Study, planning, seeing through scams.' },
  { id: 'technical', name: 'Technical', icon: '🛠️', desc: 'Repair, trades, code.' },
  { id: 'endurance', name: 'Endurance', icon: '🏃', desc: 'Stamina for long, hard shifts.' },
];

export function xpForLevel(level) { return level * 25; }

// ---------------------------------------------------------------------------
// Status tiers — net worth drives the HUD status label & headline goal.
// ---------------------------------------------------------------------------
export const STATUS_TIERS = [
  { id: 'homeless', name: 'Homeless', min: -Infinity, max: 100 },
  { id: 'getting_by', name: 'Getting By', min: 100, max: 1000 },
  { id: 'working_class', name: 'Working Class', min: 1000, max: 8000 },
  { id: 'comfortable', name: 'Comfortable', min: 8000, max: 30000 },
  { id: 'established', name: 'Established', min: 30000, max: 120000 },
  { id: 'wealthy', name: 'Wealthy', min: 120000, max: 500000 },
  { id: 'self_made_elite', name: 'Self-Made Elite', min: 500000, max: Infinity },
];

export function tierForNetWorth(nw) {
  return STATUS_TIERS.find(t => nw >= t.min && nw < t.max) || STATUS_TIERS[0];
}
export function tierIndex(id) { return STATUS_TIERS.findIndex(t => t.id === id); }

// ---------------------------------------------------------------------------
// Locations — the starting neighborhood is open from day one; downtown career
// sites unlock once you buy a bus pass at the Bus Stop.
// ---------------------------------------------------------------------------
export const LOCATIONS = [
  { id: 'under_bridge', name: 'Under the Bridge', icon: '🌉', district: 'low',
    desc: 'Dry, out of the wind, and free. Nobody bothers you much, but nobody\'s watching your back either.' },
  { id: 'shelter', name: 'Riverside Shelter', icon: '⛺', district: 'low',
    desc: 'A cot, a locker, and a caseworker who actually remembers your name.' },
  { id: 'food_bank', name: 'Community Food Bank', icon: '🥫', district: 'low',
    desc: 'No questions asked, just a hot plate and a friendly face.' },
  { id: 'library', name: 'Public Library', icon: '📖', district: 'low',
    desc: 'Free wifi, free outlets, free books, and a warm place to sit all day.' },
  { id: 'day_labor', name: 'Day Labor Office', icon: '📦', district: 'low',
    desc: 'Show up early, get picked for whatever needs lifting today.' },
  { id: 'recycling', name: 'Recycling Center', icon: '♻️', district: 'low',
    desc: 'Cans and bottles, weighed and paid out in cash on the spot.' },
  { id: 'diner', name: "Marta's Diner", icon: '🍳', district: 'low',
    desc: 'Cheap, hot, and generous portions.' },
  { id: 'laundromat', name: 'Suds City Laundromat', icon: '🧺', district: 'low',
    desc: 'Wash your one set of clothes and yourself, for a couple bucks.' },
  { id: 'square', name: 'Public Square', icon: '🎤', district: 'low',
    desc: 'Foot traffic all day. Good spot to busk or set out a blanket of things to sell.' },
  { id: 'gym', name: "Iron Yard Gym", icon: '🏋️', district: 'low',
    desc: 'Day-pass rates. Nobody here cares what you did before today.' },
  { id: 'bank', name: 'First Union Bank', icon: '🏦', district: 'low',
    desc: 'Where the money you save actually starts working for you.' },
  { id: 'bus_stop', name: 'Bus Stop', icon: '🚌', district: 'low',
    desc: 'The line downtown, if you can spare the fare for a pass.' },
  { id: 'retail_store', name: 'Bright Mart Retail', icon: '🛒', district: 'downtown',
    desc: 'Big-box retail floor. Always hiring sales associates.' },
  { id: 'office_park', name: 'Meridian Office Park', icon: '🏢', district: 'downtown',
    desc: 'Rows of cubicles and a front desk that\'s always short-staffed.' },
  { id: 'workshop', name: "Denny's Repair Workshop", icon: '🔧', district: 'downtown',
    desc: 'Electronics, small engines, whatever comes through the door.' },
  { id: 'warehouse', name: 'Harbor Logistics Warehouse', icon: '🚚', district: 'downtown',
    desc: 'Pallets in, pallets out. Steady, physical, always hiring.' },
];

export function locationsForDistricts(unlocked) {
  return LOCATIONS.filter(l => unlocked.includes(l.district));
}

// ---------------------------------------------------------------------------
// Gigs — repeatable, no application needed, available at their location.
// pay/statGain are base values scaled a little by the relevant stat level.
// ---------------------------------------------------------------------------
export const GIGS = [
  { id: 'scavenge_cans', locationId: 'recycling', name: 'Redeem Cans & Bottles',
    statId: 'endurance', payBase: 4, payPerLevel: 0.8,
    needs: { energy: -10, hygiene: -5, hunger: -6 }, statGain: 4,
    flavor: 'A few hours of picking through bins pays off, one can at a time.' },
  { id: 'day_labor_shift', locationId: 'day_labor', name: 'Take a Day Labor Job',
    statId: 'strength', payBase: 9, payPerLevel: 1.3,
    needs: { energy: -20, hygiene: -10, hunger: -10 }, statGain: 6,
    flavor: 'Loading trucks, hauling drywall — whatever the foreman needs today.' },
  { id: 'busk', locationId: 'square', name: 'Busk in the Square',
    statId: 'charisma', payBase: 2, payPerLevel: 2.4,
    needs: { energy: -9, hunger: -6 }, statGain: 6,
    flavor: 'Set up, play, and see who stops to listen.' },
  { id: 'flea_market', locationId: 'square', name: 'Sell at the Flea Market',
    statId: 'charisma', payBase: 5, payPerLevel: 1.6,
    needs: { energy: -8, hunger: -5 }, statGain: 4,
    flavor: 'Lay out whatever you\'ve scavenged and haggle a little.' },
  { id: 'delivery', locationId: 'bus_stop', name: 'Run Bike Deliveries',
    statId: 'endurance', payBase: 11, payPerLevel: 1.4,
    needs: { energy: -18, hunger: -12, hygiene: -6 }, statGain: 5,
    requiresItem: 'bike',
    flavor: 'Weaving through traffic for a delivery app, one order at a time.' },
];

// ---------------------------------------------------------------------------
// Career jobs — apply once at their location, then work a shift once per day.
// Each has a promotion ladder keyed on shifts worked + a stat threshold.
// ---------------------------------------------------------------------------
export const CAREERS = [
  {
    id: 'retail', locationId: 'retail_store', statId: 'charisma', name: 'Bright Mart Retail',
    reqStat: 2, reqReputation: -20,
    roles: [
      { title: 'Sales Associate', wage: 45, shiftsToPromote: 6, reqStat: 4 },
      { title: 'Shift Supervisor', wage: 78, shiftsToPromote: 10, reqStat: 7 },
      { title: 'Store Manager', wage: 130, shiftsToPromote: Infinity, reqStat: 9 },
    ],
  },
  {
    id: 'office', locationId: 'office_park', statId: 'intelligence', name: 'Meridian Office Park',
    reqStat: 3, reqReputation: -10,
    roles: [
      { title: 'Office Assistant', wage: 55, shiftsToPromote: 6, reqStat: 5 },
      { title: 'Analyst', wage: 90, shiftsToPromote: 10, reqStat: 7 },
      { title: 'Operations Manager', wage: 150, shiftsToPromote: Infinity, reqStat: 9 },
    ],
  },
  {
    id: 'workshop', locationId: 'workshop', statId: 'technical', name: "Denny's Repair Workshop",
    reqStat: 3, reqReputation: -10,
    roles: [
      { title: 'Repair Tech', wage: 60, shiftsToPromote: 6, reqStat: 5 },
      { title: 'Senior Tech', wage: 98, shiftsToPromote: 10, reqStat: 7 },
      { title: 'Shop Lead', wage: 155, shiftsToPromote: Infinity, reqStat: 9 },
    ],
  },
  {
    id: 'warehouse', locationId: 'warehouse', statId: 'strength', name: 'Harbor Logistics Warehouse',
    reqStat: 2, reqReputation: -20,
    roles: [
      { title: 'Warehouse Associate', wage: 50, shiftsToPromote: 6, reqStat: 4 },
      { title: 'Team Lead', wage: 85, shiftsToPromote: 10, reqStat: 7 },
      { title: 'Warehouse Supervisor', wage: 135, shiftsToPromote: Infinity, reqStat: 9 },
    ],
  },
];

export const CAREER_SHIFT_NEEDS = { energy: -22, hygiene: -12, hunger: -12 };
export const CAREER_MIN_HYGIENE = 35;

// ---------------------------------------------------------------------------
// Housing ladder.
// type 'free'  — no cost, always available
// type 'rent'  — periodic rent (+ one-time deposit on move-in)
// type 'buy'   — one-time purchase, owned outright, counts toward net worth
// ---------------------------------------------------------------------------
export const HOUSING_TIERS = [
  { id: 'street', name: 'Street / Doorway', icon: '🌃', type: 'free',
    energyRestore: 26, warmthRestore: 8, hygieneRestore: 0, safe: false,
    desc: 'Wherever looks dry tonight.' },
  { id: 'shelter_bed', name: 'Shelter Bed', icon: '⛺', type: 'free',
    energyRestore: 48, warmthRestore: 32, hygieneRestore: 15, safe: true,
    desc: 'Free, safe, and curfewed — but it\'s a real bed.' },
  { id: 'motel', name: 'Weekly-Rate Motel', icon: '🏨', type: 'rent',
    rent: 140, rentIntervalDays: 7, deposit: 0,
    energyRestore: 64, warmthRestore: 55, hygieneRestore: 40, safe: true,
    desc: 'A door that locks and a shower that\'s yours alone.' },
  { id: 'rented_room', name: 'Rented Room (shared apt)', icon: '🚪', type: 'rent',
    rent: 450, rentIntervalDays: 30, deposit: 450, reqReputation: -10,
    energyRestore: 72, warmthRestore: 65, hygieneRestore: 55, safe: true,
    desc: 'Your own room in a shared apartment. Roommates keep to themselves.' },
  { id: 'studio', name: 'Studio Apartment', icon: '🏢', type: 'rent',
    rent: 900, rentIntervalDays: 30, deposit: 900, reqNetWorth: 3000, reqReputation: 0,
    energyRestore: 80, warmthRestore: 75, hygieneRestore: 65, safe: true,
    desc: 'Small, but entirely, finally, yours.' },
  { id: 'one_bedroom', name: 'One-Bedroom Apartment', icon: '🏬', type: 'rent',
    rent: 1500, rentIntervalDays: 30, deposit: 1500, reqNetWorth: 10000, reqReputation: 10,
    energyRestore: 86, warmthRestore: 82, hygieneRestore: 75, safe: true,
    desc: 'Space to breathe, and room to have people over.' },
  { id: 'starter_house', name: 'Starter House', icon: '🏠', type: 'buy',
    price: 60000, assetFactor: 0.7, reqNetWorth: 40000,
    energyRestore: 92, warmthRestore: 90, hygieneRestore: 85, safe: true,
    desc: 'A mortgage in your name, and a yard.' },
  { id: 'nice_house', name: 'Nice Suburban House', icon: '🏡', type: 'buy',
    price: 220000, assetFactor: 0.7, reqNetWorth: 150000,
    energyRestore: 96, warmthRestore: 95, hygieneRestore: 90, safe: true,
    desc: 'The kind of house you used to just drive past.' },
  { id: 'luxury_condo', name: 'Luxury Condo', icon: '🌆', type: 'buy',
    price: 650000, assetFactor: 0.65, reqNetWorth: 450000,
    energyRestore: 100, warmthRestore: 100, hygieneRestore: 95, safe: true,
    desc: 'A skyline view that\'s yours every single morning.' },
  { id: 'mansion', name: 'Mansion / Estate', icon: '🏛️', type: 'buy',
    price: 2000000, assetFactor: 0.6, reqNetWorth: 1500000,
    energyRestore: 100, warmthRestore: 100, hygieneRestore: 100, safe: true,
    desc: 'The top of the ladder you started climbing from a doorway.' },
];
export function housingTierIndex(id) { return HOUSING_TIERS.findIndex(h => h.id === id); }

// ---------------------------------------------------------------------------
// Shop goods — durable items, bought with cash.
// ---------------------------------------------------------------------------
export const SHOP_ITEMS = [
  { id: 'coat', name: 'Warm Coat', icon: '🧥', price: 35,
    desc: 'Cuts how fast the cold gets to you.', effect: 'Warmth decays 35% slower.' },
  { id: 'boots', name: 'Work Boots', icon: '🥾', price: 25,
    desc: 'Steel toes, real support.', effect: '+10% pay on Strength gigs & jobs.' },
  { id: 'bike', name: 'Used Bike', icon: '🚲', price: 60,
    desc: 'A little rusty, rides fine.', effect: 'Unlocks bike delivery gigs.' },
  { id: 'business_casual', name: 'Business Casual Outfit', icon: '👔', price: 50,
    desc: 'Looks the part in an interview.', effect: '+10% pay at downtown career jobs.' },
  { id: 'tool_belt', name: 'Tool Belt', icon: '🧰', price: 45,
    desc: 'Your own tools beat borrowed ones.', effect: '+10% pay on Technical gigs & jobs.' },
  { id: 'charger', name: 'Portable Charger Pack', icon: '🔋', price: 20,
    desc: 'Keeps your phone alive between outlets.', effect: 'Phone battery drains 50% slower.' },
  { id: 'glasses', name: 'Reading Glasses', icon: '👓', price: 15,
    desc: 'Turns out you needed these for the library books.', effect: '+15% Intelligence stat gains.' },
];

// ---------------------------------------------------------------------------
// Market — a handful of fictional stocks for the Bank app's investing tab.
// ---------------------------------------------------------------------------
export const STOCKS = [
  { symbol: 'BWF', name: 'Bridgeway Foods', startPrice: 12, drift: 0.001, vol: 0.035 },
  { symbol: 'CTX', name: 'Cascade Tech', startPrice: 28, drift: 0.002, vol: 0.06 },
  { symbol: 'IRF', name: 'Ironclad Freight', startPrice: 18, drift: 0.0012, vol: 0.04 },
  { symbol: 'LUM', name: 'Lumen Energy', startPrice: 9, drift: 0.0015, vol: 0.05 },
];

// ---------------------------------------------------------------------------
// Reputation labels.
// ---------------------------------------------------------------------------
export function reputationLabel(rep) {
  if (rep >= 60) return 'Pillar of the Community';
  if (rep >= 30) return 'Respected';
  if (rep >= 5) return 'Trusted';
  if (rep > -20) return 'Unknown';
  if (rep > -50) return 'Distrusted';
  return 'Burned Every Bridge';
}

// ---------------------------------------------------------------------------
// Achievements.
// ---------------------------------------------------------------------------
export const ACHIEVEMENTS = [
  { id: 'first_paycheck', icon: '💵', name: 'First Paycheck', desc: 'Earn your first cash.' },
  { id: 'first_stat_up', icon: '📈', name: 'Getting Better', desc: 'Level up a stat for the first time.' },
  { id: 'bank_account', icon: '🏦', name: 'Banking On It', desc: 'Open a bank account.' },
  { id: 'first_job', icon: '🧑‍💼', name: 'Punching In', desc: 'Get hired at a career job.' },
  { id: 'promotion', icon: '⬆️', name: 'Moving Up', desc: 'Earn a promotion.' },
  { id: 'off_the_street', icon: '🔑', name: 'Off the Street', desc: 'Rent your first room.' },
  { id: 'own_a_home', icon: '🏠', name: 'Homeowner', desc: 'Buy a house outright.' },
  { id: 'first_investment', icon: '📊', name: 'Skin in the Game', desc: 'Buy your first shares.' },
  { id: 'respected', icon: '🤝', name: 'Respected', desc: 'Reach Respected reputation.' },
  { id: 'tier_getting_by', icon: '⭐', name: 'Getting By', desc: 'Reach Getting By status.' },
  { id: 'tier_working_class', icon: '⭐', name: 'Working Class', desc: 'Reach Working Class status.' },
  { id: 'tier_comfortable', icon: '⭐', name: 'Comfortable', desc: 'Reach Comfortable status.' },
  { id: 'tier_established', icon: '⭐', name: 'Established', desc: 'Reach Established status.' },
  { id: 'tier_wealthy', icon: '⭐', name: 'Wealthy', desc: 'Reach Wealthy status.' },
  { id: 'tier_elite', icon: '👑', name: 'Self-Made Elite', desc: 'Reach Self-Made Elite status.' },
  { id: 'survived_week', icon: '📅', name: 'One Week In', desc: 'Survive your first 7 days.' },
  { id: 'give_back', icon: '❤️', name: 'Giving Back', desc: 'Donate to the shelter that once took you in.' },
];

// ---------------------------------------------------------------------------
// Random morning events, weighted. `resolve` mutates state via helpers passed
// in by state.js and returns a toast/modal description.
// ---------------------------------------------------------------------------
export const OLD_RAY_TIPS = [
  "Old Ray taps his temple. \"Library's got free wifi and it's warm all day. Best-kept secret in this town.\"",
  "\"Landlords check more than your wallet,\" Ray says. \"Show up clean, show up steady — word gets around either way.\"",
  "Ray nods at your phone. \"Keep that thing charged. Can't work a gig app on a dead battery.\"",
  "\"Bank account's the whole game,\" Ray tells you. \"Get an ID, get an account, get your money working for you instead of just sitting in your pocket.\"",
  "\"Don't burn yourself out chasing every gig,\" Ray warns. \"Tired and starving doesn't pay better. It pays worse.\"",
  "Ray grins. \"I remember my first paycheck. Didn't spend it for a week, just liked looking at it.\"",
];
