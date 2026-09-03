import {
  STATUS_TIERS, tierForNetWorth, tierIndex, xpForLevel,
  HOUSING_TIERS, housingTierIndex, GIGS, CAREERS, CAREER_SHIFT_NEEDS, CAREER_MIN_HYGIENE,
  SHOP_ITEMS, STOCKS, ACHIEVEMENTS, reputationLabel, OLD_RAY_TIPS, BLOCKS,
} from './data.js';

const SAVE_KEY = 'groundup_save_v1';
const ACTIONS_PER_DAY = 3;
const BLOCK_PHONE_DRAIN = 6;
const NEEDS_DECAY = { hunger: -8, energy: -6, hygiene: -5, warmth: -6 };

function clamp(n, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }
function round2(n) { return Math.round(n * 100) / 100; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function freshRun() {
  const stats = {}, statXP = {};
  for (const s of ['strength', 'charisma', 'intelligence', 'technical', 'endurance']) { stats[s] = 1; statXP[s] = 0; }
  const stockPrices = {};
  for (const s of STOCKS) stockPrices[s.symbol] = s.startPrice;
  const stocks = {};
  for (const s of STOCKS) stocks[s.symbol] = 0;
  const inventory = {};
  for (const item of SHOP_ITEMS) inventory[item.id] = false;

  return {
    day: 1,
    blockIndex: 0,
    cash: 8,
    bank: { hasID: false, hasAccount: false, balance: 0, loan: null },
    needs: { hunger: 55, energy: 50, hygiene: 20, warmth: 55 },
    phoneBattery: 5,
    stats, statXP,
    reputation: 0,
    housingId: 'street',
    nextRentDueDay: null,
    job: null, // { careerId, roleIndex, shiftsWorked }
    inventory,
    hasBusPass: false,
    unlockedDistricts: ['low'],
    stocks, stockPrices,
    sickDays: 0,
    streak: 0,
    donatedToShelter: false,
    introSeen: false,
    messageLog: [],
    achievements: [],
    peakNetWorth: 8,
    startedAt: Date.now(),
    pendingEvent: null,
  };
}

class GameState extends EventTarget {
  constructor() {
    super();
    this.run = this._load() || freshRun();
  }

  _load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.run)); } catch (e) { /* ignore */ }
    this.dispatchEvent(new CustomEvent('change'));
  }

  log(text) {
    this.run.messageLog.unshift({ day: this.run.day, text });
    this.run.messageLog = this.run.messageLog.slice(0, 40);
  }

  // ---------------- derived ----------------
  get stocksValue() {
    return STOCKS.reduce((sum, s) => sum + this.run.stocks[s.symbol] * this.run.stockPrices[s.symbol], 0);
  }
  get homeAssetValue() {
    const h = this.housingTier;
    return h.type === 'buy' ? Math.round(h.price * h.assetFactor) : 0;
  }
  get loanRemaining() { return this.run.bank.loan ? this.run.bank.loan.remaining : 0; }
  get netWorth() {
    return round2(this.run.cash + this.run.bank.balance + this.stocksValue + this.homeAssetValue - this.loanRemaining);
  }
  get tier() { return tierForNetWorth(this.netWorth); }
  get housingTier() { return HOUSING_TIERS.find(h => h.id === this.run.housingId) || HOUSING_TIERS[0]; }
  get reputationLabel() { return reputationLabel(this.run.reputation); }
  get blockName() { return BLOCKS[this.run.blockIndex] ?? 'Night'; }
  get blocksLeft() { return Math.max(0, ACTIONS_PER_DAY - this.run.blockIndex); }
  canAct() { return this.run.blockIndex < ACTIONS_PER_DAY; }
  isRoughOff() { const n = this.run.needs; return n.hunger <= 0 || n.energy <= 0 || n.hygiene <= 0 || n.warmth <= 0; }
  currentJobInfo() {
    if (!this.run.job) return null;
    const career = CAREERS.find(c => c.id === this.run.job.careerId);
    const role = career.roles[this.run.job.roleIndex];
    return { career, role };
  }
  statLevel(id) { return this.run.stats[id]; }

  // ---------------- money ----------------
  addCash(amount, opts = {}) {
    this.run.cash = round2(Math.max(0, this.run.cash + amount));
    if (this.netWorth > this.run.peakNetWorth) this.run.peakNetWorth = this.netWorth;
    if (amount > 0 && !this.run.achievements.includes('first_paycheck')) this.unlockAchievement('first_paycheck');
    this._checkTierAchievements();
    if (!opts.silent) this.save(); else this.dispatchEvent(new CustomEvent('change'));
    return this.run.cash;
  }
  spendMoney(amount) {
    amount = round2(amount);
    if (this.run.cash >= amount) { this.run.cash = round2(this.run.cash - amount); this.save(); return true; }
    if (this.run.cash + this.run.bank.balance >= amount) {
      this.run.bank.balance = round2(this.run.bank.balance - (amount - this.run.cash));
      this.run.cash = 0;
      this.save();
      return true;
    }
    return false;
  }
  canAfford(amount) { return this.run.cash + this.run.bank.balance >= amount; }

  // ---------------- needs / stats ----------------
  applyNeedsDelta(delta) {
    for (const k of Object.keys(delta)) {
      this.run.needs[k] = clamp(round2(this.run.needs[k] + delta[k]));
    }
  }
  gainStatXP(statId, amount) {
    if (statId === 'intelligence' && this.run.inventory.glasses) amount *= 1.15;
    this.run.statXP[statId] += amount;
    let leveled = false;
    while (this.run.stats[statId] < 10 && this.run.statXP[statId] >= xpForLevel(this.run.stats[statId])) {
      this.run.statXP[statId] -= xpForLevel(this.run.stats[statId]);
      this.run.stats[statId]++;
      leveled = true;
    }
    if (leveled && !this.run.achievements.includes('first_stat_up')) this.unlockAchievement('first_stat_up');
    return leveled;
  }

  // ---------------- block-costing actions ----------------
  _advanceBlock() {
    const decayMult = { warmth: this.run.inventory.coat ? 0.65 : 1 };
    this.applyNeedsDelta({
      hunger: NEEDS_DECAY.hunger,
      energy: NEEDS_DECAY.energy,
      hygiene: NEEDS_DECAY.hygiene,
      warmth: NEEDS_DECAY.warmth * (decayMult.warmth ?? 1),
    });
    const drain = this.run.inventory.charger ? BLOCK_PHONE_DRAIN / 2 : BLOCK_PHONE_DRAIN;
    this.run.phoneBattery = clamp(this.run.phoneBattery - drain);
    this.run.blockIndex++;
  }

  doGig(gigId) {
    if (!this.canAct()) return { ok: false, reason: 'No time left today — get some sleep.' };
    const gig = GIGS.find(g => g.id === gigId);
    if (gig.requiresItem && !this.run.inventory[gig.requiresItem]) {
      return { ok: false, reason: `You need a ${gig.requiresItem} for that.` };
    }
    const roughBefore = this.isRoughOff();
    this._advanceBlock();
    let pay = gig.payBase + gig.payPerLevel * this.statLevel(gig.statId);
    if (gig.statId === 'strength' && this.run.inventory.boots) pay *= 1.1;
    if (gig.statId === 'technical' && this.run.inventory.tool_belt) pay *= 1.1;
    if (roughBefore) pay *= 0.7;
    pay = round2(pay);
    this.applyNeedsDelta(gig.needs);
    this.gainStatXP(gig.statId, gig.statGain);
    this.addCash(pay, { silent: true });
    this.log(`${gig.name}: earned $${pay.toFixed(2)}.`);
    this.save();
    return { ok: true, pay, roughOff: roughBefore, flavor: gig.flavor };
  }

  applyToCareer(careerId) {
    if (!this.canAct()) return { ok: false, reason: 'No time left today — get some sleep.' };
    const career = CAREERS.find(c => c.id === careerId);
    if (this.statLevel(career.statId) < career.reqStat) {
      return { ok: false, reason: `Needs ${career.statId} level ${career.reqStat}+.` };
    }
    if (this.run.reputation < career.reqReputation) {
      return { ok: false, reason: 'Your reputation is working against you here.' };
    }
    if (this.run.needs.hygiene < CAREER_MIN_HYGIENE) {
      return { ok: false, reason: 'You need to clean up before an interview like this.' };
    }
    this._advanceBlock();
    this.run.job = { careerId, roleIndex: 0, shiftsWorked: 0 };
    this.log(`Hired at ${career.name} as a ${career.roles[0].title}.`);
    this.unlockAchievement('first_job');
    this.save();
    return { ok: true, career };
  }

  quitJob() { this.run.job = null; this.save(); }

  markIntroSeen() { this.run.introSeen = true; this.save(); }

  workShift() {
    if (!this.canAct()) return { ok: false, reason: 'No time left today — get some sleep.' };
    if (!this.run.job) return { ok: false, reason: 'You don\'t work here.' };
    const { career, role } = this.currentJobInfo();
    const roughBefore = this.isRoughOff();
    const lowHygiene = this.run.needs.hygiene < CAREER_MIN_HYGIENE;
    this._advanceBlock();
    let wage = role.wage;
    if (career.statId === 'charisma' || career.statId === 'intelligence') { if (this.run.inventory.business_casual) wage *= 1.1; }
    if (career.statId === 'strength' && this.run.inventory.boots) wage *= 1.1;
    if (career.statId === 'technical' && this.run.inventory.tool_belt) wage *= 1.1;
    if (roughBefore) wage *= 0.7;
    if (lowHygiene) wage *= 0.8;
    wage = round2(wage);
    this.applyNeedsDelta(CAREER_SHIFT_NEEDS);
    this.gainStatXP(career.statId, 8);
    this.addCash(wage, { silent: true });
    this.run.job.shiftsWorked++;
    if (Math.random() < 0.4) this.run.reputation = Math.min(100, this.run.reputation + 1);
    let promoted = false;
    const next = career.roles[this.run.job.roleIndex + 1];
    if (next && this.run.job.shiftsWorked >= role.shiftsToPromote && this.statLevel(career.statId) >= next.reqStat) {
      this.run.job.roleIndex++;
      this.run.job.shiftsWorked = 0;
      promoted = true;
      this.unlockAchievement('promotion');
      this.log(`Promoted to ${next.title} at ${career.name}!`);
    }
    this.log(`Worked a shift at ${career.name}: earned $${wage.toFixed(2)}.`);
    this.save();
    return { ok: true, wage, promoted, roughOff: roughBefore };
  }

  // ---------------- needs actions ----------------
  eat(kind) {
    if (!this.canAct()) return { ok: false, reason: 'No time left today — get some sleep.' };
    if (kind === 'buy' && !this.canAfford(6)) return { ok: false, reason: 'Not enough cash for a meal.' };
    this._advanceBlock();
    if (kind === 'free') { this.applyNeedsDelta({ hunger: 35 }); this.log('Free meal at the food bank.'); }
    else { this.spendMoney(6); this.applyNeedsDelta({ hunger: 55 }); this.log('Bought a hot meal at the diner.'); }
    this.save();
    return { ok: true };
  }
  shower(kind) {
    if (!this.canAct()) return { ok: false, reason: 'No time left today — get some sleep.' };
    if (kind === 'paid' && !this.canAfford(4)) return { ok: false, reason: 'Not enough cash.' };
    this._advanceBlock();
    if (kind === 'free') { this.applyNeedsDelta({ hygiene: 55 }); this.log('Showered at the shelter.'); }
    else { this.spendMoney(4); this.applyNeedsDelta({ hygiene: 65, warmth: 5 }); this.log('Washed up at the laundromat.'); }
    this.save();
    return { ok: true };
  }
  studyLibrary() {
    if (!this.canAct()) return { ok: false, reason: 'No time left today — get some sleep.' };
    this._advanceBlock();
    this.gainStatXP('intelligence', 6);
    this.applyNeedsDelta({ warmth: 10 });
    this.log('Studied at the library.');
    this.save();
    return { ok: true };
  }
  chargePhone() {
    if (!this.canAct()) return { ok: false, reason: 'No time left today — get some sleep.' };
    this._advanceBlock();
    this.run.phoneBattery = 100;
    this.log('Charged your phone at the library.');
    this.save();
    return { ok: true };
  }
  gymWorkout() {
    if (!this.canAct()) return { ok: false, reason: 'No time left today — get some sleep.' };
    if (!this.canAfford(8)) return { ok: false, reason: 'Not enough cash for a day pass.' };
    this._advanceBlock();
    this.spendMoney(8);
    this.gainStatXP('strength', 8);
    this.applyNeedsDelta({ energy: -12 });
    this.log('Worked out at the gym.');
    this.save();
    return { ok: true };
  }
  getID() {
    if (!this.canAct()) return { ok: false, reason: 'No time left today — get some sleep.' };
    if (this.run.bank.hasID) return { ok: false, reason: 'You already have an ID.' };
    if (this.run.reputation < -30) return { ok: false, reason: 'The caseworker isn\'t able to help right now.' };
    this._advanceBlock();
    this.run.bank.hasID = true;
    this.log('Got a state ID with help from the shelter caseworker.');
    this.save();
    return { ok: true };
  }
  donateToShelter(amount) {
    if (!this.canAfford(amount)) return { ok: false, reason: 'Not enough cash.' };
    this.spendMoney(amount);
    this.run.reputation = Math.min(100, this.run.reputation + 15);
    this.run.donatedToShelter = true;
    this.unlockAchievement('give_back');
    this.log(`Donated $${amount} to the shelter that once took you in.`);
    this.save();
    return { ok: true };
  }

  // ---------------- instant admin actions ----------------
  openBankAccount() {
    if (!this.run.bank.hasID) return { ok: false, reason: 'You need an ID first.' };
    if (this.run.bank.hasAccount) return { ok: false, reason: 'Already have an account.' };
    this.run.bank.hasAccount = true;
    this.unlockAchievement('bank_account');
    this.save();
    return { ok: true };
  }
  deposit(amount) {
    if (!this.run.bank.hasAccount || this.run.cash < amount) return { ok: false };
    this.run.cash = round2(this.run.cash - amount);
    this.run.bank.balance = round2(this.run.bank.balance + amount);
    this.save();
    return { ok: true };
  }
  withdraw(amount) {
    if (!this.run.bank.hasAccount || this.run.bank.balance < amount) return { ok: false };
    this.run.bank.balance = round2(this.run.bank.balance - amount);
    this.run.cash = round2(this.run.cash + amount);
    this.save();
    return { ok: true };
  }
  applyLoan(amount) {
    if (!this.run.bank.hasAccount || this.run.reputation < 30 || this.run.bank.loan) return { ok: false };
    const total = round2(amount * 1.15);
    this.run.bank.loan = { principal: amount, remaining: total, weeklyPayment: round2(total / 10), nextPaymentDay: this.run.day + 7 };
    this.run.cash = round2(this.run.cash + amount);
    this.save();
    return { ok: true };
  }
  buyStock(symbol, shares) {
    const cost = round2(this.run.stockPrices[symbol] * shares);
    if (!this.canAfford(cost) || shares <= 0) return { ok: false };
    this.spendMoney(cost);
    this.run.stocks[symbol] += shares;
    this.unlockAchievement('first_investment');
    this.save();
    return { ok: true };
  }
  sellStock(symbol, shares) {
    if (this.run.stocks[symbol] < shares || shares <= 0) return { ok: false };
    this.run.stocks[symbol] -= shares;
    this.addCash(round2(this.run.stockPrices[symbol] * shares), { silent: true });
    this.save();
    return { ok: true };
  }
  buyShopItem(id) {
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (this.run.inventory[id]) return { ok: false, reason: 'Already own this.' };
    if (!this.spendMoney(item.price)) return { ok: false, reason: 'Not enough cash.' };
    this.run.inventory[id] = true;
    this.save();
    return { ok: true };
  }
  buyBusPass() {
    if (this.run.hasBusPass) return { ok: false, reason: 'Already have a bus pass.' };
    if (!this.spendMoney(20)) return { ok: false, reason: 'Not enough cash.' };
    this.run.hasBusPass = true;
    this.run.unlockedDistricts.push('downtown');
    this.save();
    return { ok: true };
  }

  // ---------------- housing ----------------
  moveToFreeHousing(id) {
    this.run.housingId = id;
    this.run.nextRentDueDay = null;
    this.save();
    return { ok: true };
  }
  rentHousing(tier) {
    if (tier.reqNetWorth && this.netWorth < tier.reqNetWorth) return { ok: false, reason: 'Your net worth isn\'t there yet.' };
    if (tier.reqReputation !== undefined && this.run.reputation < tier.reqReputation) return { ok: false, reason: 'A landlord won\'t take a chance on you yet.' };
    const moveInCost = tier.deposit + tier.rent;
    if (!this.spendMoney(moveInCost)) return { ok: false, reason: 'Not enough for deposit + first payment.' };
    this.run.housingId = tier.id;
    this.run.nextRentDueDay = this.run.day + tier.rentIntervalDays;
    this.unlockAchievement('off_the_street');
    this.save();
    return { ok: true };
  }
  buyHousing(tier) {
    if (tier.reqNetWorth && this.netWorth < tier.reqNetWorth) return { ok: false, reason: 'Your net worth isn\'t there yet.' };
    if (!this.spendMoney(tier.price)) return { ok: false, reason: 'Not enough saved up.' };
    this.run.housingId = tier.id;
    this.run.nextRentDueDay = null;
    this.unlockAchievement('own_a_home');
    this.save();
    return { ok: true };
  }

  // ---------------- achievements ----------------
  unlockAchievement(id) {
    if (this.run.achievements.includes(id)) return;
    this.run.achievements.push(id);
    const def = ACHIEVEMENTS.find(a => a.id === id);
    this.dispatchEvent(new CustomEvent('achievement', { detail: def }));
  }
  _checkTierAchievements() {
    const map = {
      getting_by: 'tier_getting_by', working_class: 'tier_working_class', comfortable: 'tier_comfortable',
      established: 'tier_established', wealthy: 'tier_wealthy', self_made_elite: 'tier_elite',
    };
    const id = map[this.tier.id];
    if (id) this.unlockAchievement(id);
    if (this.run.reputation >= 30) this.unlockAchievement('respected');
  }

  // ---------------- sleep / day rollover ----------------
  sleep() {
    const h = this.housingTier;
    this.applyNeedsDelta({ hunger: NEEDS_DECAY.hunger, energy: h.energyRestore, hygiene: h.hygieneRestore, warmth: h.warmthRestore });
    this.run.phoneBattery = clamp(this.run.phoneBattery - (this.run.inventory.charger ? 3 : 6));

    const wasSick = this.run.needs.hunger <= 5 || this.run.needs.hygiene <= 5;
    this.run.sickDays = wasSick ? this.run.sickDays + 1 : 0;

    // rent / loan due
    const rollingToDay = this.run.day + 1;
    let evicted = false;
    if (h.type === 'rent' && this.run.nextRentDueDay !== null && rollingToDay >= this.run.nextRentDueDay) {
      if (this.spendMoney(h.rent)) {
        this.run.nextRentDueDay += h.rentIntervalDays;
      } else {
        const idx = Math.max(0, housingTierIndex(h.id) - 1);
        this.run.housingId = HOUSING_TIERS[idx].type === 'free' ? HOUSING_TIERS[idx].id : 'shelter_bed';
        this.run.nextRentDueDay = null;
        this.run.reputation -= 8;
        evicted = true;
        this.log(`Couldn't make rent at ${h.name} — lost the place.`);
      }
    }
    let loanMissed = false;
    if (this.run.bank.loan && rollingToDay >= this.run.bank.loan.nextPaymentDay) {
      const loan = this.run.bank.loan;
      if (this.spendMoney(loan.weeklyPayment)) {
        loan.remaining = round2(loan.remaining - loan.weeklyPayment);
        loan.nextPaymentDay += 7;
        if (loan.remaining <= 0) this.run.bank.loan = null;
      } else {
        this.run.reputation -= 10;
        loanMissed = true;
      }
    }
    if (this.run.bank.hasAccount && rollingToDay % 7 === 0) {
      this.run.bank.balance = round2(this.run.bank.balance + this.run.bank.balance * 0.005);
    }
    for (const s of STOCKS) {
      const price = this.run.stockPrices[s.symbol];
      const change = price * (s.drift + (Math.random() * 2 - 1) * s.vol);
      this.run.stockPrices[s.symbol] = Math.max(1, round2(price + change));
    }

    this.run.day = rollingToDay;
    this.run.blockIndex = wasSick && this.run.sickDays >= 2 ? 1 : 0;
    if (this.run.blockIndex === 1) this.log('Woke up feeling sick and lost the morning resting.');
    this.run.streak++;
    if (this.run.streak >= 7) this.unlockAchievement('survived_week');

    this._checkTierAchievements();
    const event = this._rollEvent(evicted, loanMissed);
    this.run.pendingEvent = event;
    this.save();
    return event;
  }

  _rollEvent(evicted, loanMissed) {
    if (evicted) return { title: 'Eviction', text: 'You couldn\'t keep up with rent and lost your place. Back to something more affordable.', type: 'bad' };
    if (loanMissed) return { title: 'Missed Payment', text: 'You missed a loan payment. Your reputation took a hit.', type: 'bad' };

    const roll = Math.random() * 100;
    if (roll > 55) return null;

    const candidates = [];
    candidates.push({ w: 12, ev: () => {
      const bad = !this.housingTier.safe;
      this.applyNeedsDelta({ warmth: bad ? -20 : -6 });
      return { title: 'Cold Snap', text: bad ? 'A cold snap rolled through overnight and it hit you hard.' : 'A cold snap rolled through, but you had a roof over your head.', type: 'bad' };
    } });
    if (this.housingTier.id === 'street') candidates.push({ w: 15, ev: () => {
      this.applyNeedsDelta({ energy: -10 });
      const loss = Math.min(round2(this.run.cash * 0.1), 8);
      this.run.cash = round2(this.run.cash - loss);
      return { title: 'Moved Along', text: `An officer asks you to move along before dawn. You lost $${loss.toFixed(2)} in the scramble.`, type: 'bad' };
    } });
    if (this.run.cash >= 10) candidates.push({ w: 10, ev: () => {
      if (this.statLevel('intelligence') >= 4) {
        return { title: 'Almost Got Got', text: 'A stranger offers to double your cash on the spot. Something felt off, and you were right to walk away.', type: 'good' };
      }
      const loss = Math.min(round2(this.run.cash * 0.25), 40);
      this.run.cash = round2(this.run.cash - loss);
      return { title: 'Scammed', text: `You believed a stranger's too-good offer and lost $${loss.toFixed(2)}.`, type: 'bad' };
    } });
    const missingItem = ['coat', 'charger'].find(i => !this.run.inventory[i]);
    if (missingItem) candidates.push({ w: 8, ev: () => {
      this.run.inventory[missingItem] = true;
      const name = SHOP_ITEMS.find(i => i.id === missingItem).name;
      return { title: 'Lucky Find', text: `Someone left a ${name} behind. Now it's yours.`, type: 'good' };
    } });
    candidates.push({ w: 10, ev: () => {
      const bonus = round2(15 + Math.random() * 15);
      this.addCash(bonus, { silent: true });
      return { title: 'Small Break', text: `A stranger paid you $${bonus.toFixed(2)} extra for a hand carrying groceries.`, type: 'good' };
    } });
    candidates.push({ w: 15, ev: () => {
      if (Math.random() < 0.3) this.run.reputation = Math.min(100, this.run.reputation + 1);
      return { title: 'Old Ray Stops By', text: pick(OLD_RAY_TIPS), type: 'neutral' };
    } });
    if (this.housingTier.type !== 'free') candidates.push({ w: 10, ev: () => {
      const amt = round2(15 + Math.random() * 25);
      if (this.spendMoney(amt)) return { title: 'Unexpected Bill', text: `A bill came due. Paid $${amt.toFixed(2)}.`, type: 'bad' };
      this.run.reputation -= 3;
      return { title: 'Unexpected Bill', text: `A bill came due and you couldn't cover it.`, type: 'bad' };
    } });

    const total = candidates.reduce((s, c) => s + c.w, 0);
    let r = Math.random() * total;
    for (const c of candidates) { if ((r -= c.w) <= 0) return c.ev(); }
    return null;
  }
}

export const state = new GameState();
