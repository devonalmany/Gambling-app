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

// ---------------------------------------------------------------- Screens
const screens = {}; // name -> { render, onShow }
let currentScreen = 'floor';

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

export function refreshCurrentScreen() {
  showScreen(currentScreen);
}

// ---------------------------------------------------------------- HUD
export function renderHUD() {
  qs('#hud-cash').textContent = fmtMoney(state.netWorth);
  qs('#hud-status').textContent = state.tier.name;
  qs('#hud-style').textContent = state.run.stylePoints.toLocaleString();

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
}

state.addEventListener('change', renderHUD);
state.addEventListener('achievement', (e) => {
  const a = e.detail;
  toast(`<div class="achv-item"><span class="icon">${a.icon}</span><div><strong>Achievement Unlocked</strong><br>${a.name}</div></div>`, 'win', 5000);
});

// ---------------------------------------------------------------- Locked gate helper
export function tierGateBanner(reqTierId) {
  const reqTier = STATUS_TIERS.find(t => t.id === reqTierId);
  return `<div class="panel"><h3>🔒 Locked</h3><p class="subtle">Reach <strong>${reqTier.name}</strong> status (net worth ${fmtMoney(reqTier.min)}) to unlock this.</p></div>`;
}
