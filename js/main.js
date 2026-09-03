import { state } from './state.js';
import { el, qs, qsa, fmtMoney, toast, showModal, closeModal, registerScreen, showScreen, renderHUD } from './ui.js';
import { STATUS_TIERS, ACHIEVEMENTS, CASH_MIN_BET_FLOOR } from './data.js';
import * as Blackjack from './games/blackjack.js';
import * as Roulette from './games/roulette.js';
import * as Slots from './games/slots.js';
import * as Poker from './games/poker.js';
import * as Shops from './shops.js';

// ------------------------------------------------------------- Bankruptcy
export function checkBankruptcy() {
  if (state.run.cash >= CASH_MIN_BET_FLOOR) return false;
  const summary = state.triggerBankruptcy();
  showBankruptcyModal(summary);
  return true;
}

function showBankruptcyModal(summary) {
  const comeback = state.meta.hasComebackBonus ? `<p class="subtle">Comeback Bonus applied — you're starting this run with ${fmtMoney(state.run.cash)} instead of $5.00.</p>` : '';
  showModal(`
    <h2>💸 GAME OVER — BUSTED</h2>
    <p class="subtle">The house always wins eventually. But every whale started homeless once.</p>
    <div class="modal-stats">
      <div><span>Peak Net Worth</span><strong>${fmtMoney(summary.peakNetWorth)}</strong></div>
      <div><span>Biggest Single Win</span><strong>${fmtMoney(summary.biggestWin)}</strong></div>
      <div><span>Hands / Spins Played</span><strong>${summary.handsPlayed}</strong></div>
      <div><span>Total Bankruptcies</span><strong>${state.meta.bankruptcies}</strong></div>
    </div>
    ${comeback}
    <button class="btn" id="restart-btn">Back to the Bench</button>
  `, { closable: false });
  qs('#restart-btn').addEventListener('click', () => {
    closeModal();
    showScreen('floor');
  });
}

// ------------------------------------------------------------- Casino Floor
registerScreen('floor', {
  render(container) {
    const t = state.tier;
    const games = [
      { id: 'poker', icon: '🃏', name: "Texas Hold'em", desc: 'Outplay the AI regulars, hand by hand.' },
      { id: 'blackjack', icon: '🂡', name: 'Blackjack', desc: 'Beat the dealer to 21.' },
      { id: 'roulette', icon: '🎡', name: 'Roulette', desc: 'Red or black. Odd or even. All in.' },
      { id: 'slots', icon: '🎰', name: 'Slot Machines', desc: 'Spin the reels, chase the jackpot.' },
    ];
    container.appendChild(el(`
      <div class="tier-banner">
        <div>
          <div class="title">${t.name}</div>
          <div class="desc">${t.desc}</div>
        </div>
        <div style="text-align:right">
          <div class="hud-value">${fmtMoney(state.netWorth)}</div>
          <div class="subtle">Net Worth</div>
        </div>
      </div>
    `));
    const grid = el(`<div class="game-grid"></div>`);
    games.forEach(g => {
      const card = el(`
        <div class="game-card" data-nav="${g.id}">
          <div class="emoji">${g.icon}</div>
          <h3>${g.name}</h3>
          <p class="subtle">${g.desc}</p>
        </div>
      `);
      card.addEventListener('click', () => showScreen(g.id));
      grid.appendChild(card);
    });
    container.appendChild(grid);

    container.appendChild(el(`
      <div class="panel" style="margin-top:20px">
        <h3>Your Setup</h3>
        <div class="flex-between">
          <span class="subtle">🏠 ${state.homeTier.name} — ${state.homeTier.perk}</span>
          <button class="btn secondary small" data-nav="home-shop">Home Shop</button>
        </div>
        <div class="flex-between" style="margin-top:10px">
          <span class="subtle">👔 Style Points: ${state.run.stylePoints}</span>
          <button class="btn secondary small" data-nav="personal-shop">Style Shop</button>
        </div>
      </div>
    `));
    qsa('[data-nav]', container).forEach(b => {
      if (b.dataset.nav) b.addEventListener('click', () => showScreen(b.dataset.nav));
    });
  },
});

// ------------------------------------------------------------- Register games/shops
registerScreen('blackjack', Blackjack);
registerScreen('roulette', Roulette);
registerScreen('slots', Slots);
registerScreen('poker', Poker);
registerScreen('personal-shop', Shops.personalShopScreen);
registerScreen('home-shop', Shops.homeShopScreen);

// ------------------------------------------------------------- Nav wiring
qsa('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

// ------------------------------------------------------------- Stats / Achievements modal
qs('#stats-btn').addEventListener('click', () => {
  const unlocked = new Set(state.meta.achievements);
  const list = ACHIEVEMENTS.map(a => `
    <div class="achv-item" style="opacity:${unlocked.has(a.id) ? 1 : 0.35}; margin-bottom:8px;">
      <span class="icon">${a.icon}</span>
      <div style="text-align:left"><strong>${a.name}</strong><br><span class="subtle">${a.desc}</span></div>
    </div>
  `).join('');
  const hof = state.meta.hallOfFame.slice(0, 5).map(h => `
    <div><span>${new Date(h.date).toLocaleDateString()}</span><strong>${fmtMoney(h.peakNetWorth)} peak</strong></div>
  `).join('') || '<p class="subtle">No busted runs yet — keep it that way.</p>';
  showModal(`
    <h2>🏆 Stats & Achievements</h2>
    <div class="modal-stats">
      <div><span>Current Net Worth</span><strong>${fmtMoney(state.netWorth)}</strong></div>
      <div><span>Peak Net Worth (this run)</span><strong>${fmtMoney(state.run.peakNetWorth)}</strong></div>
      <div><span>Hands / Spins Played</span><strong>${state.run.handsPlayed}</strong></div>
      <div><span>Biggest Win</span><strong>${fmtMoney(state.run.biggestWin)}</strong></div>
      <div><span>Times Busted</span><strong>${state.meta.bankruptcies}</strong></div>
    </div>
    <h3>Hall of Fame (Past Runs)</h3>
    <div class="modal-stats">${hof}</div>
    <h3>Achievements (${unlocked.size}/${ACHIEVEMENTS.length})</h3>
    <div style="max-height:220px; overflow-y:auto; text-align:left;">${list}</div>
    <button class="btn" id="close-stats">Close</button>
  `);
  qs('#close-stats').addEventListener('click', closeModal);
});

// ------------------------------------------------------------- Pause / Take a Break
let sessionStart = Date.now();
qs('#pause-btn').addEventListener('click', () => {
  const mins = Math.round((Date.now() - sessionStart) / 60000);
  showModal(`
    <h2>⏸ Paused</h2>
    <p class="subtle">You've been playing for about ${mins} minute${mins === 1 ? '' : 's'} this session.</p>
    <p>Remember: HIGH ROLLER uses fictional currency only. There is no real-money purchase or cash-out path. It's just a game — play at a pace that feels good.</p>
    <div style="display:flex; gap:10px; justify-content:center; margin-top:16px;">
      <button class="btn" id="resume-btn">Resume Playing</button>
      <button class="btn secondary" id="break-btn">Take a Break</button>
    </div>
  `, { closable: false });
  qs('#resume-btn').addEventListener('click', closeModal);
  qs('#break-btn').addEventListener('click', () => {
    showModal(`
      <h2>👋 See You Soon</h2>
      <p class="subtle">Your progress is saved automatically. Close this tab whenever you're ready — the casino floor will be right here.</p>
      <button class="btn" id="ok-break">Got it</button>
    `, { closable: false });
    qs('#ok-break').addEventListener('click', closeModal);
  });
});

// Periodic gentle session-length nudge every 45 minutes of active play.
setInterval(() => {
  toast('You’ve been at the tables a while. Everything’s saved — feel free to take a break anytime via the ⏸ button.', 'info', 6000);
}, 45 * 60 * 1000);

// ------------------------------------------------------------- Init
renderHUD();
showScreen('floor');
