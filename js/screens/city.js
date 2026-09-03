import { state } from '../state.js';
import { registerScreen, el, qs, qsa, toast, refreshCurrentScreen, fmtMoney } from '../ui.js';
import { LOCATIONS, locationsForDistricts, GIGS, CAREERS } from '../data.js';

function run(fn) {
  const res = fn();
  if (res && res.ok === false) toast(res.reason || 'Can\'t do that right now.', 'bad');
  else if (res && res.ok) refreshCurrentScreen();
}

function gigButtons(loc) {
  return GIGS.filter(g => g.locationId === loc.id).map(g => {
    const locked = g.requiresItem && !state.run.inventory[g.requiresItem];
    return `<button class="btn" data-gig="${g.id}" ${locked ? 'disabled' : ''}>
      ${g.name}${locked ? ` (need ${g.requiresItem})` : ''}
    </button>`;
  }).join('');
}

function careerButtons(loc) {
  const career = CAREERS.find(c => c.locationId === loc.id);
  if (!career) return '';
  const employed = state.run.job && state.run.job.careerId === career.id;
  const role = career.roles[0];
  if (employed) {
    const info = state.currentJobInfo();
    return `
      <p class="subtle">You work here as a <strong>${info.role.title}</strong> ($${info.role.wage}/shift).</p>
      <button class="btn primary" data-work="${career.id}">Work a Shift</button>
      <button class="btn ghost" data-quit="${career.id}">Quit</button>
    `;
  }
  return `
    <p class="subtle">Entry role: ${role.title} · $${role.wage}/shift · needs ${career.statId} ${career.reqStat}+</p>
    <button class="btn" data-apply="${career.id}">Apply</button>
  `;
}

function locationActions(loc) {
  switch (loc.id) {
    case 'shelter': {
      const idBtn = state.run.bank.hasID ? '' : `<button class="btn" data-getid="1">Get an ID (caseworker)</button>`;
      const donateBtn = state.netWorth >= 5000 && !state.run.donatedToShelter
        ? `<button class="btn gold" data-donate="200">Donate $200 to the Shelter</button>` : '';
      return `
        <button class="btn" data-eat="free">Free Meal</button>
        <button class="btn" data-shower="free">Free Shower</button>
        ${idBtn}${donateBtn}
      `;
    }
    case 'food_bank': return `<button class="btn" data-eat="free">Free Meal</button>`;
    case 'library': return `
      <button class="btn" data-study="1">Study (Intelligence)</button>
      <button class="btn" data-charge="1">Charge Phone</button>
    `;
    case 'day_labor': case 'recycling': case 'square': return gigButtons(loc);
    case 'diner': return `<button class="btn" data-eat="buy">Buy a Meal ($6)</button>`;
    case 'laundromat': return `<button class="btn" data-shower="paid">Wash Up ($4)</button>`;
    case 'gym': return `<button class="btn" data-gym="1">Workout ($8)</button>`;
    case 'bank': return `<button class="btn" data-goto="phone">Open Bank App</button>`;
    case 'bus_stop': return state.run.hasBusPass
      ? `<p class="subtle">Bus pass active — downtown is open.</p>`
      : `<button class="btn gold" data-buspass="1">Buy Bus Pass ($20)</button>`;
    case 'retail_store': case 'office_park': case 'workshop': case 'warehouse': return careerButtons(loc);
    default: return '';
  }
}

function render(container) {
  const unlocked = locationsForDistricts(state.run.unlockedDistricts);
  const blocksLeft = state.blocksLeft;

  container.appendChild(el(`
    <div class="screen-inner">
      <div class="panel intro-panel">
        <h2>The City</h2>
        <p class="subtle">${blocksLeft > 0
          ? `You have <strong>${blocksLeft}</strong> ${blocksLeft === 1 ? 'thing' : 'things'} left in you today.`
          : `You're out of gas for today — head to <strong>Housing</strong> and get some sleep.`}</p>
      </div>
      <div class="card-grid" id="loc-grid"></div>
    </div>
  `));

  const grid = qs('#loc-grid', container);
  for (const loc of unlocked) {
    const actions = locationActions(loc);
    grid.appendChild(el(`
      <div class="panel loc-card">
        <h3>${loc.icon} ${loc.name}</h3>
        <p class="subtle">${loc.desc}</p>
        <div class="loc-actions">${actions || '<p class="subtle">Nothing to do here right now.</p>'}</div>
      </div>
    `));
  }

  if (!state.run.hasBusPass) {
    grid.appendChild(el(`
      <div class="panel loc-card locked-card">
        <h3>🔒 Downtown</h3>
        <p class="subtle">Retail, office, repair, and warehouse jobs wait downtown. Buy a bus pass at the Bus Stop to open it up.</p>
      </div>
    `));
  }

  qsa('[data-gig]', container).forEach(b => b.addEventListener('click', () => {
    const res = state.doGig(b.dataset.gig);
    if (res.ok) toast(`${res.flavor ? res.flavor + ' ' : ''}+$${res.pay.toFixed(2)}${res.roughOff ? ' (rough shape today — reduced pay)' : ''}`, res.roughOff ? 'warn' : 'good');
    else toast(res.reason, 'bad');
    refreshCurrentScreen();
  }));
  qsa('[data-eat]', container).forEach(b => b.addEventListener('click', () => run(() => state.eat(b.dataset.eat))));
  qsa('[data-shower]', container).forEach(b => b.addEventListener('click', () => run(() => state.shower(b.dataset.shower))));
  qsa('[data-study]', container).forEach(b => b.addEventListener('click', () => run(() => state.studyLibrary())));
  qsa('[data-charge]', container).forEach(b => b.addEventListener('click', () => run(() => state.chargePhone())));
  qsa('[data-gym]', container).forEach(b => b.addEventListener('click', () => run(() => state.gymWorkout())));
  qsa('[data-getid]', container).forEach(b => b.addEventListener('click', () => run(() => state.getID())));
  qsa('[data-donate]', container).forEach(b => b.addEventListener('click', () => run(() => state.donateToShelter(Number(b.dataset.donate)))));
  qsa('[data-buspass]', container).forEach(b => b.addEventListener('click', () => run(() => state.buyBusPass())));
  qsa('[data-apply]', container).forEach(b => b.addEventListener('click', () => {
    const res = state.applyToCareer(b.dataset.apply);
    if (!res.ok) toast(res.reason, 'bad'); else toast(`Hired! You start as a ${res.career.roles[0].title}.`, 'good');
    refreshCurrentScreen();
  }));
  qsa('[data-work]', container).forEach(b => b.addEventListener('click', () => {
    const res = state.workShift();
    if (!res.ok) { toast(res.reason, 'bad'); return; }
    toast(`Earned $${res.wage.toFixed(2)}${res.promoted ? ' — and got promoted!' : ''}`, res.promoted ? 'win' : 'good');
    refreshCurrentScreen();
  }));
  qsa('[data-quit]', container).forEach(b => b.addEventListener('click', () => { state.quitJob(); toast('You quit.', 'info'); refreshCurrentScreen(); }));
  qsa('[data-goto]', container).forEach(b => b.addEventListener('click', () => window.dispatchEvent(new CustomEvent('nav', { detail: b.dataset.goto }))));
}

registerScreen('city', { render });
