import { state } from '../state.js';
import { registerScreen, el, qs, qsa, toast, refreshCurrentScreen, fmtMoney } from '../ui.js';
import { CAREERS, GIGS, LOCATIONS, STOCKS } from '../data.js';

let activeTab = 'jobs';

function tabButton(id, label) {
  return `<button class="tab-btn ${activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`;
}

function renderJobs() {
  const gigRows = GIGS.map(g => {
    const loc = LOCATIONS.find(l => l.id === g.locationId);
    return `<div class="list-row"><span>${g.name}</span><span class="subtle">${loc.name} · ~$${g.payBase.toFixed(0)}+</span></div>`;
  }).join('');

  if (!state.run.unlockedDistricts.includes('downtown')) {
    return `
      <div class="panel"><h3>Gig Board</h3>${gigRows}</div>
      <div class="panel"><h3>Career Listings</h3><p class="subtle">Buy a bus pass at the Bus Stop to see downtown career openings.</p></div>
    `;
  }

  const careerRows = CAREERS.map(c => {
    const employed = state.run.job && state.run.job.careerId === c.id;
    const meetsStat = state.statLevel(c.statId) >= c.reqStat;
    const meetsRep = state.run.reputation >= c.reqReputation;
    let action = '';
    if (employed) action = `<span class="pill">Employed</span>`;
    else if (!meetsStat) action = `<span class="subtle">Needs ${c.statId} ${c.reqStat}+</span>`;
    else if (!meetsRep) action = `<span class="subtle">Reputation too low</span>`;
    else action = `<button class="btn" data-apply="${c.id}">Apply</button>`;
    return `<div class="list-row">
      <span>${c.name} — ${c.roles[0].title}</span>
      <span class="subtle">$${c.roles[0].wage}/shift</span>
      ${action}
    </div>`;
  }).join('');

  return `
    <div class="panel"><h3>Gig Board</h3><p class="subtle">Walk-in work, no application needed.</p>${gigRows}</div>
    <div class="panel"><h3>Career Listings</h3><p class="subtle">Apply here, then work shifts in person.</p>${careerRows}</div>
  `;
}

function renderBank() {
  const b = state.run.bank;
  let html = `<div class="panel"><h3>Account</h3>`;
  if (!b.hasID) {
    html += `<p class="subtle">You'll need an ID before you can open an account — the shelter caseworker can help.</p>`;
  } else if (!b.hasAccount) {
    html += `<button class="btn primary" data-open-account="1">Open Bank Account</button>`;
  } else {
    html += `
      <div class="list-row"><span>Cash on hand</span><span>${fmtMoney(state.run.cash)}</span></div>
      <div class="list-row"><span>Bank balance</span><span>${fmtMoney(b.balance)}</span></div>
      <div class="btn-row">
        <button class="btn" data-deposit="20">Deposit $20</button>
        <button class="btn" data-deposit="all">Deposit All</button>
        <button class="btn" data-withdraw="20">Withdraw $20</button>
        <button class="btn" data-withdraw="all">Withdraw All</button>
      </div>
    `;
    if (b.loan) {
      html += `<p class="subtle">Loan remaining: ${fmtMoney(b.loan.remaining)} (payment ${fmtMoney(b.loan.weeklyPayment)}/wk)</p>`;
    } else if (state.run.reputation >= 30) {
      html += `<h4>Take a Loan</h4><div class="btn-row">
        <button class="btn gold" data-loan="200">$200</button>
        <button class="btn gold" data-loan="500">$500</button>
        <button class="btn gold" data-loan="1000">$1000</button>
      </div><p class="subtle">Repaid weekly, 15% total interest.</p>`;
    } else {
      html += `<p class="subtle">Reach "Respected" reputation (30+) to qualify for a loan.</p>`;
    }
  }
  html += `</div>`;

  html += `<div class="panel"><h3>Market</h3><p class="subtle">Portfolio value: ${fmtMoney(state.stocksValue)}</p>`;
  for (const s of STOCKS) {
    const price = state.run.stockPrices[s.symbol];
    const owned = state.run.stocks[s.symbol];
    html += `<div class="list-row stock-row">
      <span>${s.symbol} <span class="subtle">${s.name}</span></span>
      <span>${fmtMoney(price)}</span>
      <span class="subtle">${owned} owned</span>
      <span class="btn-row tight">
        <button class="btn small" data-buy-stock="${s.symbol}">Buy 1</button>
        <button class="btn small" data-sell-stock="${s.symbol}" ${owned <= 0 ? 'disabled' : ''}>Sell 1</button>
      </span>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function renderMap() {
  const districts = [
    { id: 'low', name: 'The Neighborhood', unlocked: true },
    { id: 'downtown', name: 'Downtown', unlocked: state.run.unlockedDistricts.includes('downtown') },
  ];
  return districts.map(d => {
    const locs = LOCATIONS.filter(l => l.district === d.id);
    return `<div class="panel">
      <h3>${d.unlocked ? '' : '🔒 '}${d.name}</h3>
      ${d.unlocked
        ? locs.map(l => `<div class="list-row"><span>${l.icon} ${l.name}</span></div>`).join('')
        : '<p class="subtle">Buy a bus pass at the Bus Stop to unlock.</p>'}
    </div>`;
  }).join('');
}

function renderMessages() {
  if (state.run.messageLog.length === 0) return `<div class="panel"><p class="subtle">No messages yet.</p></div>`;
  return `<div class="panel">${state.run.messageLog.map(m => `
    <div class="list-row"><span class="subtle">Day ${m.day}</span><span>${m.text}</span></div>
  `).join('')}</div>`;
}

function render(container) {
  if (state.run.phoneBattery <= 0) {
    container.appendChild(el(`
      <div class="screen-inner">
        <div class="panel"><h2>📱 Phone</h2><p class="subtle">Your phone is dead. Charge it at the Library.</p></div>
      </div>
    `));
    return;
  }

  container.appendChild(el(`
    <div class="screen-inner">
      <div class="panel intro-panel">
        <h2>📱 Phone <span class="subtle">(${Math.round(state.run.phoneBattery)}% battery)</span></h2>
        <div class="tab-row">
          ${tabButton('jobs', 'Jobs')}
          ${tabButton('bank', 'Bank')}
          ${tabButton('map', 'Map')}
          ${tabButton('messages', 'Messages')}
        </div>
      </div>
      <div id="phone-body"></div>
    </div>
  `));

  const body = qs('#phone-body', container);
  const renderers = { jobs: renderJobs, bank: renderBank, map: renderMap, messages: renderMessages };
  body.innerHTML = renderers[activeTab]();

  qsa('.tab-btn', container).forEach(b => b.addEventListener('click', () => { activeTab = b.dataset.tab; refreshCurrentScreen(); }));
  qsa('[data-apply]', container).forEach(b => b.addEventListener('click', () => {
    const res = state.applyToCareer(b.dataset.apply);
    if (!res.ok) toast(res.reason, 'bad'); else toast(`Hired! You start as a ${res.career.roles[0].title}.`, 'good');
    refreshCurrentScreen();
  }));
  qsa('[data-open-account]', container).forEach(b => b.addEventListener('click', () => {
    const res = state.openBankAccount();
    toast(res.ok ? 'Account opened!' : res.reason, res.ok ? 'good' : 'bad');
    refreshCurrentScreen();
  }));
  qsa('[data-deposit]', container).forEach(b => b.addEventListener('click', () => {
    const amt = b.dataset.deposit === 'all' ? state.run.cash : Number(b.dataset.deposit);
    const res = state.deposit(amt);
    if (!res.ok) toast('Not enough cash.', 'bad');
    refreshCurrentScreen();
  }));
  qsa('[data-withdraw]', container).forEach(b => b.addEventListener('click', () => {
    const amt = b.dataset.withdraw === 'all' ? state.run.bank.balance : Number(b.dataset.withdraw);
    const res = state.withdraw(amt);
    if (!res.ok) toast('Not enough in the bank.', 'bad');
    refreshCurrentScreen();
  }));
  qsa('[data-loan]', container).forEach(b => b.addEventListener('click', () => {
    const res = state.applyLoan(Number(b.dataset.loan));
    toast(res.ok ? 'Loan approved.' : 'Loan denied.', res.ok ? 'good' : 'bad');
    refreshCurrentScreen();
  }));
  qsa('[data-buy-stock]', container).forEach(b => b.addEventListener('click', () => {
    const res = state.buyStock(b.dataset.buyStock, 1);
    if (!res.ok) toast('Not enough cash.', 'bad');
    refreshCurrentScreen();
  }));
  qsa('[data-sell-stock]', container).forEach(b => b.addEventListener('click', () => {
    state.sellStock(b.dataset.sellStock, 1);
    refreshCurrentScreen();
  }));
}

registerScreen('phone', { render });
