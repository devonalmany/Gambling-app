import { STATUS_TIERS, tierForNetWorth, tierIndex, HOME_TIERS, ACHIEVEMENTS, PERSONAL_SHOP_ITEMS, HUSTLE_COOLDOWN_MS, FREE_CHIPS_COOLDOWN_MS, HUSTLE_REWARDS, FREE_CHIPS_REWARDS } from './data.js';

const SAVE_KEY = 'highroller_save_v1';

function freshRun(comebackBonus = 0) {
  return {
    cash: 5 + comebackBonus,
    stylePoints: 0,
    homeId: 'bench',
    equipped: { outfit: 'outfit_hoodie', jewelry: 'jewel_none', hair: 'hair_default' },
    ownedCosmetics: ['outfit_hoodie', 'jewel_none', 'hair_default'],
    ownedTeammates: [],
    lastDailyBonus: 0,
    lastHustle: 0,
    lastFreeChips: 0,
    handsPlayed: 0,
    biggestWin: 0,
    peakNetWorth: 5 + comebackBonus,
    jackpot: 2500, // shared progressive jackpot pool
    startedAt: Date.now(),
  };
}

function freshMeta() {
  return {
    achievements: [],
    bankruptcies: 0,
    hasComebackBonus: false,
    hallOfFame: [], // {peakNetWorth, handsPlayed, date}
    lifetimeCosmeticsUnlocked: [],
    sessionStart: Date.now(),
  };
}

class GameState extends EventTarget {
  constructor() {
    super();
    const saved = this._load();
    this.run = saved?.run || freshRun();
    this.meta = saved?.meta || freshMeta();
    this._grantDailyBonusIfDue();
  }

  _load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ run: this.run, meta: this.meta }));
    } catch (e) { /* storage unavailable, ignore */ }
    this.dispatchEvent(new CustomEvent('change'));
  }

  // ---------------- derived ----------------
  get netWorth() { return this.run.cash; }
  get tier() { return tierForNetWorth(this.netWorth); }
  get homeTier() { return HOME_TIERS.find(h => h.id === this.run.homeId) || HOME_TIERS[0]; }
  get hostBonus() { return this.homeTier.hostBonus || 0; }

  meetsTier(reqTierId) {
    return tierIndex(this.tier.id) >= tierIndex(reqTierId);
  }

  // ---------------- daily bonus ----------------
  _grantDailyBonusIfDue() {
    const bonus = this.homeTier.dailyBonus;
    if (!bonus) return;
    const oneDay = 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (now - this.run.lastDailyBonus > oneDay) {
      this.run.lastDailyBonus = now;
      this.addCash(bonus, { silent: false, reason: `Daily home bonus (+$${bonus})` });
    }
  }

  // ---------------- cash / points ----------------
  addCash(amount, opts = {}) {
    this.run.cash = Math.max(0, round2(this.run.cash + amount));
    if (this.run.cash > this.run.peakNetWorth) this.run.peakNetWorth = this.run.cash;
    this._checkTierUp();
    this.save();
    return this.run.cash;
  }

  spendCash(amount) {
    if (this.run.cash < amount) return false;
    this.run.cash = round2(this.run.cash - amount);
    this.save();
    return true;
  }

  addStylePoints(amount) {
    this.run.stylePoints = Math.max(0, Math.round(this.run.stylePoints + amount));
    this.save();
  }

  spendStylePoints(amount) {
    if (this.run.stylePoints < amount) return false;
    this.run.stylePoints -= amount;
    this.save();
    return true;
  }

  recordWin(amount) {
    if (amount > this.run.biggestWin) this.run.biggestWin = amount;
    this.addStylePoints(Math.max(1, Math.floor(amount / 20)));
    if (!this.meta.achievements.includes('first_win')) this.unlockAchievement('first_win');
  }

  recordHandPlayed() {
    this.run.handsPlayed++;
    if (this.run.handsPlayed >= 100) this.unlockAchievement('survive_100');
    this.save();
  }

  // ---------------- tiers / achievements ----------------
  _checkTierUp() {
    const t = this.tier.id;
    const map = { grinder: 'grinder_tier', regular: 'regular_tier', highroller: 'highroller_tier', whale: 'whale_tier', owner: 'owner_tier' };
    if (map[t]) this.unlockAchievement(map[t]);
    if (this.meta.bankruptcies > 0 && (t === 'regular' || tierIndex(t) > tierIndex('regular'))) {
      this.unlockAchievement('comeback');
    }
  }

  unlockAchievement(id) {
    if (this.meta.achievements.includes(id)) return;
    this.meta.achievements.push(id);
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (def?.reward) this.addCash(def.reward);
    this.dispatchEvent(new CustomEvent('achievement', { detail: def }));
    this.save();
  }

  // ---------------- quick cash (no-risk faucets) ----------------
  hustleStatus() {
    const remaining = HUSTLE_COOLDOWN_MS - (Date.now() - (this.run.lastHustle || 0));
    return { ready: remaining <= 0, remainingMs: Math.max(0, remaining), reward: HUSTLE_REWARDS[this.tier.id] };
  }

  hustle() {
    const status = this.hustleStatus();
    if (!status.ready) return { ok: false, reason: 'Not ready yet.' };
    this.run.lastHustle = Date.now();
    this.addCash(status.reward);
    return { ok: true, amount: status.reward };
  }

  freeChipsStatus() {
    const remaining = FREE_CHIPS_COOLDOWN_MS - (Date.now() - (this.run.lastFreeChips || 0));
    return { ready: remaining <= 0, remainingMs: Math.max(0, remaining), reward: FREE_CHIPS_REWARDS[this.tier.id] };
  }

  claimFreeChips() {
    const status = this.freeChipsStatus();
    if (!status.ready) return { ok: false, reason: 'Not ready yet.' };
    this.run.lastFreeChips = Date.now();
    this.addCash(status.reward);
    return { ok: true, amount: status.reward };
  }

  // ---------------- cosmetics / home ----------------
  ownsCosmetic(id) { return this.run.ownedCosmetics.includes(id); }

  buyCosmetic(item) {
    if (this.ownsCosmetic(item.id)) return { ok: false, reason: 'Already owned' };
    const paid = item.currency === 'style' ? this.spendStylePoints(item.price) : this.spendCash(item.price);
    if (!paid) return { ok: false, reason: `Not enough ${item.currency === 'style' ? 'Style Points' : 'cash'}` };
    this.run.ownedCosmetics.push(item.id);
    if (!this.meta.lifetimeCosmeticsUnlocked.includes(item.id)) this.meta.lifetimeCosmeticsUnlocked.push(item.id);
    this.run.equipped[item.slot] = item.id;
    this.save();
    return { ok: true };
  }

  equipCosmetic(item) {
    if (!this.ownsCosmetic(item.id)) return false;
    this.run.equipped[item.slot] = item.id;
    this.save();
    return true;
  }

  buyTeammate(tm) {
    if (this.run.ownedTeammates.includes(tm.id)) return { ok: false, reason: 'Already recruited' };
    const paid = tm.currency === 'style' ? this.spendStylePoints(tm.price) : this.spendCash(tm.price);
    if (!paid) return { ok: false, reason: `Not enough ${tm.currency === 'style' ? 'Style Points' : 'cash'}` };
    this.run.ownedTeammates.push(tm.id);
    this.save();
    return { ok: true };
  }

  buyHome(home) {
    if (this.run.homeId === home.id) return { ok: false, reason: 'Already your home' };
    if (!this.spendCash(home.price)) return { ok: false, reason: 'Not enough cash' };
    this.run.homeId = home.id;
    this.run.lastDailyBonus = Date.now() - 24 * 60 * 60 * 1000 - 1; // eligible immediately next check
    if (!this.meta.achievements.includes('own_a_home') && home.price > 0) this.unlockAchievement('own_a_home');
    if (home.id === 'penthouse') this.unlockAchievement('penthouse');
    this.save();
    return { ok: true };
  }

  // ---------------- bankroll / equipped bonuses ----------------
  get equippedBonus() {
    const bonus = { tellResist: 0, confidence: 0 };
    for (const id of Object.values(this.run.equipped)) {
      const item = PERSONAL_SHOP_ITEMS.find(i => i.id === id);
      if (item?.bonus) {
        bonus.tellResist += item.bonus.tellResist || 0;
        bonus.confidence += item.bonus.confidence || 0;
      }
    }
    return bonus;
  }

  canAffordAnyMinBet(minBets) {
    return minBets.some(m => this.run.cash >= m);
  }

  // ---------------- bankruptcy ----------------
  isBankrupt(allMinBets) {
    return this.run.cash <= 0 || !this.canAffordAnyMinBet(allMinBets);
  }

  triggerBankruptcy() {
    this.meta.bankruptcies++;
    this.meta.hallOfFame.unshift({
      peakNetWorth: this.run.peakNetWorth,
      handsPlayed: this.run.handsPlayed,
      biggestWin: this.run.biggestWin,
      date: new Date().toISOString(),
    });
    this.meta.hallOfFame = this.meta.hallOfFame.slice(0, 20);
    this.unlockAchievement('first_bankruptcy');
    const summary = { ...this.run };
    this.meta.hasComebackBonus = true;
    const comebackBonus = this.meta.bankruptcies > 0 ? 5 : 0; // $10 total next run instead of $5
    this.run = freshRun(comebackBonus);
    this.save();
    return summary;
  }
}

function round2(n) { return Math.round(n * 100) / 100; }

export const state = new GameState();
