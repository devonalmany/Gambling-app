import { state } from '../state.js';
import { registerScreen, el, fmtMoney } from '../ui.js';
import { STATUS_TIERS, ACHIEVEMENTS } from '../data.js';

function render(container) {
  const tiersHtml = STATUS_TIERS.map(t => {
    const reached = state.netWorth >= t.min;
    const current = state.tier.id === t.id;
    return `<div class="list-row ${current ? 'current-tier' : ''}">
      <span>${reached ? '✅' : '⬜'} ${t.name}</span>
      <span class="subtle">${fmtMoney(t.min)}${t.max !== Infinity ? ` – ${fmtMoney(t.max)}` : '+'}</span>
    </div>`;
  }).join('');

  const achHtml = ACHIEVEMENTS.map(a => {
    const unlocked = state.run.achievements.includes(a.id);
    return `<div class="panel achv-card ${unlocked ? '' : 'locked'}">
      <span class="icon">${unlocked ? a.icon : '🔒'}</span>
      <div><strong>${a.name}</strong><br><span class="subtle">${a.desc}</span></div>
    </div>`;
  }).join('');

  container.appendChild(el(`
    <div class="screen-inner">
      <div class="panel"><h2>🏆 Progress</h2>
        <p>Net worth: <strong>${fmtMoney(state.netWorth)}</strong> · Peak: ${fmtMoney(state.run.peakNetWorth)}</p>
        <p>Days survived: ${state.run.day}</p>
      </div>
      <div class="panel"><h3>Status Ladder</h3>${tiersHtml}</div>
      <div class="card-grid">${achHtml}</div>
    </div>
  `));
}

registerScreen('progress', { render });
