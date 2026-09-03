import { state } from '../state.js';
import { registerScreen, el, qs, qsa, toast, refreshCurrentScreen, showEventModal, fmtMoney } from '../ui.js';
import { HOUSING_TIERS } from '../data.js';

function tierCard(tier) {
  const isCurrent = state.run.housingId === tier.id;
  let priceLabel = 'Free';
  if (tier.type === 'rent') priceLabel = `${fmtMoney(tier.rent)}/${tier.rentIntervalDays === 7 ? 'wk' : 'mo'} (+${fmtMoney(tier.deposit)} deposit)`;
  if (tier.type === 'buy') priceLabel = `${fmtMoney(tier.price)} (own outright)`;

  const reasons = [];
  if (tier.reqNetWorth && state.netWorth < tier.reqNetWorth) reasons.push(`Needs net worth ${fmtMoney(tier.reqNetWorth)}+`);
  if (tier.reqReputation !== undefined && state.run.reputation < tier.reqReputation) reasons.push('Reputation too low');
  const locked = reasons.length > 0;

  let btn;
  if (isCurrent) btn = `<span class="pill">Current Home</span>`;
  else if (tier.type === 'free') btn = `<button class="btn" data-move="${tier.id}">Move In</button>`;
  else if (tier.type === 'rent') btn = `<button class="btn" data-rent="${tier.id}" ${locked ? 'disabled' : ''}>Rent</button>`;
  else btn = `<button class="btn gold" data-buy="${tier.id}" ${locked ? 'disabled' : ''}>Buy</button>`;

  return `<div class="panel loc-card ${isCurrent ? 'current-home' : ''}">
    <h3>${tier.icon} ${tier.name}</h3>
    <p class="subtle">${tier.desc}</p>
    <p class="subtle">${priceLabel}</p>
    <p class="subtle">Energy +${tier.energyRestore} · Warmth +${tier.warmthRestore} · Hygiene +${tier.hygieneRestore}${tier.safe ? '' : ' · risky overnight'}</p>
    ${reasons.length ? `<p class="subtle warn-text">${reasons.join(' · ')}</p>` : ''}
    ${btn}
  </div>`;
}

function render(container) {
  container.appendChild(el(`
    <div class="screen-inner">
      <div class="panel intro-panel">
        <h2>🏠 Housing</h2>
        <p class="subtle">Current: <strong>${state.housingTier.name}</strong></p>
        <button class="btn primary big" id="sleep-btn">🌙 Sleep Tonight</button>
      </div>
      <div class="card-grid" id="housing-grid"></div>
    </div>
  `));

  const grid = qs('#housing-grid', container);
  for (const tier of HOUSING_TIERS) grid.appendChild(el(tierCard(tier)));

  qs('#sleep-btn', container).addEventListener('click', () => {
    const event = state.sleep();
    toast('A new day begins.', 'info');
    refreshCurrentScreen();
    if (event) showEventModal(event);
  });
  qsa('[data-move]', container).forEach(b => b.addEventListener('click', () => { state.moveToFreeHousing(b.dataset.move); refreshCurrentScreen(); }));
  qsa('[data-rent]', container).forEach(b => b.addEventListener('click', () => {
    const tier = HOUSING_TIERS.find(t => t.id === b.dataset.rent);
    const res = state.rentHousing(tier);
    toast(res.ok ? `Moved into ${tier.name}.` : res.reason, res.ok ? 'good' : 'bad');
    refreshCurrentScreen();
  }));
  qsa('[data-buy]', container).forEach(b => b.addEventListener('click', () => {
    const tier = HOUSING_TIERS.find(t => t.id === b.dataset.buy);
    const res = state.buyHousing(tier);
    toast(res.ok ? `You bought ${tier.name}!` : res.reason, res.ok ? 'win' : 'bad');
    refreshCurrentScreen();
  }));
}

registerScreen('housing', { render });
