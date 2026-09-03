import { state } from '../state.js';
import { registerScreen, el, qs, fmtMoney } from '../ui.js';
import { STATS, xpForLevel, SHOP_ITEMS } from '../data.js';

function render(container) {
  const statsHtml = STATS.map(s => {
    const level = state.statLevel(s.id);
    const xp = state.run.statXP[s.id];
    const need = level >= 10 ? xp : xpForLevel(level);
    const pct = level >= 10 ? 100 : Math.min(100, (xp / need) * 100);
    return `<div class="stat-row">
      <span class="stat-name">${s.icon} ${s.name} <span class="subtle">Lv ${level}</span></span>
      <div class="progress-bar small"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="subtle stat-desc">${s.desc}</span>
    </div>`;
  }).join('');

  const needs = state.run.needs;
  const needsHtml = ['hunger', 'energy', 'hygiene', 'warmth'].map(k => `
    <div class="stat-row">
      <span class="stat-name">${k[0].toUpperCase()}${k.slice(1)}</span>
      <div class="progress-bar small"><div class="progress-fill" style="width:${needs[k]}%"></div></div>
      <span class="subtle">${Math.round(needs[k])}%</span>
    </div>
  `).join('');

  const job = state.currentJobInfo();
  const jobHtml = job
    ? `<p>${job.role.title} at <strong>${job.career.name}</strong> — $${job.role.wage}/shift · ${state.run.job.shiftsWorked} shifts toward next promotion</p>`
    : `<p class="subtle">Unemployed — no career job yet.</p>`;

  const owned = SHOP_ITEMS.filter(i => state.run.inventory[i.id]);
  const invHtml = owned.length
    ? owned.map(i => `<div class="list-row"><span>${i.icon} ${i.name}</span><span class="subtle">${i.effect}</span></div>`).join('')
    : `<p class="subtle">Nothing yet — check the Shop.</p>`;

  container.appendChild(el(`
    <div class="screen-inner">
      <div class="panel"><h2>You</h2>
        <p>Day ${state.run.day} · Net worth ${fmtMoney(state.netWorth)} · <strong>${state.tier.name}</strong></p>
        <p>Reputation: <strong>${state.reputationLabel}</strong> (${state.run.reputation})</p>
      </div>
      <div class="panel"><h3>Needs</h3>${needsHtml}</div>
      <div class="panel"><h3>Skills</h3>${statsHtml}</div>
      <div class="panel"><h3>Job</h3>${jobHtml}</div>
      <div class="panel"><h3>Inventory</h3>${invHtml}</div>
    </div>
  `));
}

registerScreen('character', { render });
