// Shared UI helpers: screen routing, toasts, modals, HUD rendering.
import { state } from './state.js';
import { STATUS_TIERS, tierIndex } from './data.js';

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function fmtMoney(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------- Toasts
export function toast(message, type = 'info', ms = 3800) {
  const root = qs('#toast-root');
  const node = el(`<div class="toast ${type}">${message}</div>`);
  root.appendChild(node);
  setTimeout(() => node.remove(), ms);
}

// ---------------------------------------------------------------- Modal
export function showModal(innerHtml, { closable = true } = {}) {
  const root = qs('#modal-root');
  root.innerHTML = '';
  const overlay = el(`<div class="modal-overlay"><div class="modal-box">${innerHtml}</div></div>`);
  if (closable) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  }
  root.appendChild(overlay);
  return overlay;
}
export function closeModal() { qs('#modal-root').innerHTML = ''; }

export function showEventModal(event) {
  if (!event) return;
  const cls = event.type === 'bad' ? 'event-bad' : event.type === 'good' ? 'event-good' : 'event-neutral';
  showModal(`
    <div class="event-modal ${cls}">
      <h3>${event.title}</h3>
      <p>${event.text}</p>
      <button class="btn primary" id="event-ok">Continue</button>
    </div>
  `);
  qs('#event-ok').addEventListener('click', closeModal);
}

// ---------------------------------------------------------------- Screens
const screens = {}; // name -> { render, onShow }
let currentScreen = 'city';

export function registerScreen(name, handlers) { screens[name] = handlers; }

export function showScreen(name) {
  if (!screens[name]) return;
  currentScreen = name;
  qsa('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === name));
  const app = qs('#app');
  app.innerHTML = '';
  const container = el(`<section class="screen active" data-screen="${name}"></section>`);
  app.appendChild(container);
  screens[name].render(container);
  if (screens[name].onShow) screens[name].onShow(container);
}

export function refreshCurrentScreen() { showScreen(currentScreen); }

// ---------------------------------------------------------------- HUD
function needBarClass(v) { return v <= 15 ? 'crit' : v <= 40 ? 'low' : 'ok'; }

export function renderHUD() {
  qs('#hud-day').textContent = `Day ${state.run.day} · ${state.blockName}`;
  qs('#hud-cash').textContent = fmtMoney(state.netWorth);
  qs('#hud-status').textContent = state.tier.name;
  qs('#hud-battery').textContent = `${Math.round(state.run.phoneBattery)}%`;

  const idx = tierIndex(state.tier.id);
  const next = STATUS_TIERS[idx + 1];
  const label = qs('#hud-tier-progress-label');
  const fill = qs('#hud-tier-progress');
  if (next) {
    const span = state.tier.max - state.tier.min;
    const pct = Math.max(0, Math.min(100, ((state.netWorth - state.tier.min) / span) * 100));
    fill.style.width = pct + '%';
    label.textContent = `Next: ${next.name} (${fmtMoney(next.min)})`;
  } else {
    fill.style.width = '100%';
    label.textContent = 'Max Tier Reached';
  }

  const needs = state.run.needs;
  for (const key of ['hunger', 'energy', 'hygiene', 'warmth']) {
    const bar = qs(`#need-${key} .need-fill`);
    const wrap = qs(`#need-${key}`);
    if (bar) {
      bar.style.width = `${needs[key]}%`;
      bar.className = `need-fill ${needBarClass(needs[key])}`;
    }
    if (wrap) wrap.title = `${key[0].toUpperCase()}${key.slice(1)}: ${Math.round(needs[key])}%`;
  }
}

state.addEventListener('change', renderHUD);
state.addEventListener('achievement', (e) => {
  const a = e.detail;
  if (!a) return;
  toast(`<div class="achv-item"><span class="icon">${a.icon}</span><div><strong>Achievement Unlocked</strong><br>${a.name}</div></div>`, 'win', 5000);
});

export function lockedBanner(reason) {
  return `<div class="panel"><h3>🔒 Not Yet</h3><p class="subtle">${reason}</p></div>`;
}
